"use server"

import { revalidatePath } from "next/cache"
import { requireActor, requireCan, isManagerRole, type ActorProfile } from "@/lib/auth/guards"
import { can } from "@/lib/domain/roles"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  assertUuid,
  normalizeEmail,
  normalizeParticipants,
  validEmail,
  validateMeetingInput,
} from "@/lib/meetings/domain"
import { connectionStatus } from "@/lib/meetings/microsoft"
import { refreshMeetingResponses, syncMeeting } from "@/lib/meetings/sync"
import type {
  CompanyContact,
  MeetingInput,
  MeetingPayload,
  MeetingRow,
  MeetingStatus,
} from "@/lib/meetings/types"

function message(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação."
}
async function companyForActor(id: string, actor: ActorProfile, write = false) {
  assertUuid(id)
  const client = await createClient()
  const { data, error } = await client
    .from("companies")
    .select("id,nome_fantasia,razao_social,owner_id")
    .eq("id", id)
    .maybeSingle()
  if (error || !data) throw new Error("Empresa não encontrada.")
  if (write && (!can(actor.role, "b2b.write") || (!isManagerRole(actor.role) && data.owner_id !== actor.id)))
    throw new Error(
      "Somente o responsável pela carteira ou a gerência pode agendar e editar contatos desta empresa.",
    )
  return data
}
async function ownedMeeting(id: string, actor: ActorProfile) {
  assertUuid(id)
  const { data, error } = await createAdminClient()
    .from("activities")
    .select("*,activity_participants(name,email)")
    .eq("id", id)
    .not("meeting_type", "is", null)
    .maybeSingle()
  if (error || !data || data.organizer_user_id !== actor.id)
    throw new Error("Somente o organizador pode alterar ou cancelar esta reunião.")
  return data as MeetingRow
}
export async function loadCompanyMeetings(companyId: string) {
  try {
    const actor = await requireActor(),
      company = await companyForActor(companyId, actor)
    const client = await createClient()
    const [contacts, meetings, microsoft] = await Promise.all([
      client
        .from("company_contacts")
        .select("id,company_id,nome,cargo,email,telefone,observacoes,is_primary")
        .eq("company_id", companyId)
        .order("is_primary", { ascending: false })
        .order("created_at"),
      client
        .from("activities")
        .select("*,activity_participants(name,email)")
        .eq("company_id", companyId)
        .not("meeting_type", "is", null)
        .order("start_at", { ascending: false }),
      connectionStatus(actor.id),
    ])
    if (contacts.error || meetings.error)
      throw new Error("Não foi possível carregar contatos e reuniões. Verifique a atualização do banco.")
    return {
      ok: true as const,
      contacts: contacts.data as CompanyContact[],
      meetings: meetings.data as MeetingRow[],
      microsoft,
      organizer: { id: actor.id, name: actor.full_name, email: actor.email || "" },
      canEdit: can(actor.role, "b2b.write") && (isManagerRole(actor.role) || company.owner_id === actor.id),
    }
  } catch (error) {
    return { ok: false as const, message: message(error) }
  }
}
export async function saveCompanyContact(companyId: string, contact: Partial<CompanyContact>) {
  try {
    const actor = await requireCan("b2b.write")
    await companyForActor(companyId, actor, true)
    if (contact.id) assertUuid(contact.id)
    const name = String(contact.nome || "").trim(),
      email = normalizeEmail(String(contact.email || ""))
    if (!name || name.length > 160) throw new Error("Informe o nome do responsável (até 160 caracteres).")
    if (email && !validEmail(email)) throw new Error("Informe um e-mail válido.")
    const { error } = await createAdminClient().rpc("b2b_save_contact", {
      p_company: companyId,
      p_id: contact.id || null,
      p_data: {
        nome: name,
        email: email || null,
        cargo: String(contact.cargo || "")
          .trim()
          .slice(0, 160),
        telefone: String(contact.telefone || "")
          .trim()
          .slice(0, 50),
        observacoes: String(contact.observacoes || "")
          .trim()
          .slice(0, 5000),
        is_primary: !!contact.is_primary,
      },
    })
    if (error) throw new Error("Não foi possível salvar o contato. Atualize a ficha e tente novamente.")
    revalidatePath("/")
    return { ok: true as const, message: "Contato salvo." }
  } catch (error) {
    return { ok: false as const, message: message(error) }
  }
}
export async function saveCompanyMeeting(input: MeetingInput) {
  try {
    const actor = await requireCan("b2b.write"),
      times = validateMeetingInput(input)
    const company = await companyForActor(input.companyId, actor, true)
    const ms = await connectionStatus(actor.id)
    if (!ms.connected || !actor.email || normalizeEmail(ms.email || "") !== normalizeEmail(actor.email))
      throw new Error("Vincule a conta Microsoft correspondente ao e-mail corporativo do seu perfil.")
    const admin = createAdminClient()
    const { data: contact, error } = await admin
      .from("company_contacts")
      .select("id,nome,email")
      .eq("id", input.contactId)
      .eq("company_id", company.id)
      .maybeSingle()
    if (error || !contact?.email || !validEmail(normalizeEmail(contact.email)))
      throw new Error("Selecione um responsável com e-mail válido na ficha da empresa.")
    if (normalizeEmail(contact.email) === normalizeEmail(ms.email!))
      throw new Error("O responsável da empresa deve ter um e-mail diferente do organizador.")
    if (Date.parse(times.start_at) <= Date.now())
      throw new Error("Agende a reunião para uma data e horário futuros.")
    if (input.revision > 0) {
      const current = await ownedMeeting(input.id, actor)
      if (current.company_id !== input.companyId)
        throw new Error("A empresa da reunião não pode ser alterada.")
    }
    const payload: MeetingPayload = {
      company_id: company.id,
      company_name: company.nome_fantasia || company.razao_social,
      contact_id: contact.id,
      contact_name: contact.nome,
      contact_email: normalizeEmail(contact.email),
      organizer_user_id: actor.id,
      organizer_name: actor.full_name,
      organizer_email: normalizeEmail(ms.email!),
      date: input.date,
      title: input.title.trim(),
      description: input.description.trim(),
      meeting_type: input.meetingType,
      ...times,
      location: input.meetingType === "presencial" ? input.location.trim() : "",
      participants: normalizeParticipants(input.participants, ms.email!, contact.email),
    }
    const { error: stageError } = await admin.rpc("b2b_stage_meeting", {
      p_id: input.id,
      p_actor: actor.id,
      p_revision: input.revision,
      p_operation: input.revision === 0 ? "create" : "update",
      p_payload: payload,
    })
    if (stageError) throw new Error(stageError.message)
    const result = await syncMeeting(input.id)
    revalidatePath("/")
    return { ok: true as const, ...result }
  } catch (error) {
    return { ok: false as const, message: message(error) }
  }
}
export async function retryCompanyMeeting(id: string) {
  try {
    const actor = await requireCan("b2b.write")
    await ownedMeeting(id, actor)
    const result = await syncMeeting(id)
    revalidatePath("/")
    return { ok: true as const, ...result }
  } catch (error) {
    return { ok: false as const, message: message(error) }
  }
}
export async function cancelCompanyMeeting(id: string, revision: number) {
  try {
    const actor = await requireCan("b2b.write"),
      meeting = await ownedMeeting(id, actor)
    if (meeting.status === "cancelada") return { ok: true as const, message: "A reunião já está cancelada." }
    const { error } = await createAdminClient().rpc("b2b_stage_meeting", {
      p_id: id,
      p_actor: actor.id,
      p_revision: revision,
      p_operation: "cancel",
      p_payload: {},
    })
    if (error) throw new Error(error.message)
    const result = await syncMeeting(id)
    revalidatePath("/")
    return { ok: true as const, ...result }
  } catch (error) {
    return { ok: false as const, message: message(error) }
  }
}
export async function refreshCompanyMeeting(id: string) {
  try {
    const actor = await requireCan("b2b.write"),
      meeting = await ownedMeeting(id, actor)
    if (meeting.sync_status !== "synced")
      throw new Error("Conclua a sincronização pendente antes de consultar respostas.")
    const result = await refreshMeetingResponses(meeting)
    return { ok: true as const, message: result }
  } catch (error) {
    return { ok: false as const, message: message(error) }
  }
}
export async function setCompanyMeetingStatus(id: string, revision: number, status: MeetingStatus) {
  try {
    const actor = await requireCan("b2b.write"),
      meeting = await ownedMeeting(id, actor)
    if (!["agendada", "reagendamento_solicitado", "realizada", "nao_compareceu"].includes(status))
      throw new Error("Status inválido. A confirmação vem da resposta do responsável no Outlook.")
    if (meeting.status === "cancelada" || meeting.sync_status !== "synced")
      throw new Error("Reunião cancelada ou com sincronização pendente.")
    if (["realizada", "nao_compareceu"].includes(status) && Date.parse(meeting.start_at) > Date.now())
      throw new Error("Registre a realização ou ausência após o início da reunião.")
    const { data, error } = await createAdminClient()
      .from("activities")
      .update({
        status,
        revision: revision + 1,
        conta_meta_semanal: status === "realizada",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("revision", revision)
      .eq("sync_status", "synced")
      .select("id")
      .maybeSingle()
    if (error || !data) throw new Error("A reunião foi alterada. Atualize a ficha e tente novamente.")
    revalidatePath("/")
    return { ok: true as const, message: "Status atualizado no histórico." }
  } catch (error) {
    return { ok: false as const, message: message(error) }
  }
}
