"use server"

import { revalidatePath } from "next/cache"
import { requireActor, isManagerRole } from "@/lib/auth/guards"
import { can } from "@/lib/domain/roles"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { assertUuid } from "@/lib/meetings/domain"
import { calendarEmailStatus } from "@/lib/calendar/smtp-config"
import { processContactMeetingQueue } from "@/lib/meetings/contact-worker"
import { selectedContacts, validateContactMeeting, type ContactMeeting, type ContactMeetingEntity,
  type ContactMeetingInput, type MeetingContact } from "@/lib/meetings/contact-domain"

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Não foi possível concluir a operação."

async function context(entity: ContactMeetingEntity, id: string, write = false) {
  assertUuid(id)
  if (entity !== "company" && entity !== "school") throw new Error("Ficha inválida.")
  const actor = await requireActor()
  if (!can(actor.role, entity === "company" ? "b2b.read.all" : "hs.read")) throw new Error("Acesso não autorizado.")
  const client = await createClient()
  const { data, error } = await client.from(entity === "company" ? "companies" : "schools")
    .select(entity === "company" ? "id,owner_id,archived_at" : "id,archived_at").eq("id", id).maybeSingle()
  if (error || !data) throw new Error("Ficha não encontrada.")
  const writable = can(actor.role, entity === "company" ? "b2b.write" : "hs.capture.write") &&
    (entity === "school" || isManagerRole(actor.role) || (data as unknown as { owner_id: string }).owner_id === actor.id)
  if (write && !writable) throw new Error("Você não pode alterar reuniões desta ficha.")
  return { actor, client, writable, archived: !!(data as unknown as { archived_at: string | null }).archived_at }
}

export async function loadContactMeetings(entity: ContactMeetingEntity, entityId: string) {
  try {
    const { actor, client, writable, archived } = await context(entity, entityId)
    const column = entity === "company" ? "company_id" : "school_id"
    const [contacts, meetings] = await Promise.all([
      client.from(entity === "company" ? "company_contacts" : "school_contacts")
        .select(entity === "company" ? "id,nome,email" : "id,name,email").eq(column, entityId),
      client.from("contact_meetings").select("*,contact_meeting_recipients(*),contact_meeting_jobs(id,meeting_id,recipient_email,operation,event_sequence,status,last_error,sent_at)")
        .eq(column, entityId).order("start_at", { ascending: false }),
    ])
    if (contacts.error || meetings.error) throw new Error("Não foi possível carregar os convites. Confira a migração do banco.")
    return { ok: true as const, contacts: (contacts.data || []).map(row => {
      const contact = row as unknown as { id: string; nome?: string; name?: string; email: string | null }
      return { id: contact.id, name: contact.nome || contact.name || "Contato", email: contact.email }
    }) as MeetingContact[], meetings: meetings.data as ContactMeeting[],
    actor: { id: actor.id, name: actor.full_name, email: actor.email }, writable, archived, paused: calendarEmailStatus().disabled }
  } catch (error) { return { ok: false as const, message: errorMessage(error) } }
}

export async function saveContactMeeting(input: ContactMeetingInput) {
  try {
    const times = validateContactMeeting(input)
    const { actor } = await context(input.entity, input.entityId, true)
    // IDs alone cross the trust boundary: contact names/addresses are resolved from this ficha.
    if (!input.revision) {
      const loaded = await loadContactMeetings(input.entity, input.entityId)
      if (!loaded.ok) throw new Error(loaded.message)
      selectedContacts(loaded.contacts, input.contactIds)
    }
    const { error } = await createAdminClient().rpc("save_contact_meeting", {
      p_actor: actor.id, p_id: input.id, p_revision: input.revision,
      p_entity: input.entity, p_entity_id: input.entityId, p_operation: input.revision ? "update" : "create",
      p_contacts: input.contactIds, p_sender: calendarEmailStatus().organizerEmail,
      p_data: { subject: input.title.trim(), description: input.description.trim(), mode: input.mode,
        location: input.location.trim(), ...times },
    })
    if (error) throw new Error(error.message)
    // SQL persists the source, snapshots and jobs even when communications are disabled.
    const delivery = await processContactMeetingQueue({ meetingId: input.id, userId: actor.id })
    revalidatePath("/")
    revalidatePath(`/high-school/escolas/${input.entityId}`)
    return { ok: true as const, message: delivery.sent
      ? "Reunião salva. Confira o envio por destinatário no histórico."
      : "Reunião salva. Os convites permanecem no histórico, aguardando liberação de envio." }
  } catch (error) { return { ok: false as const, message: errorMessage(error) } }
}

export async function cancelContactMeeting(entity: ContactMeetingEntity, entityId: string, id: string, revision: number) {
  try {
    assertUuid(id)
    const { actor } = await context(entity, entityId, true)
    const { error } = await createAdminClient().rpc("save_contact_meeting", {
      p_actor: actor.id, p_id: id, p_revision: revision, p_entity: entity, p_entity_id: entityId,
      p_operation: "cancel", p_data: {}, p_contacts: [], p_sender: calendarEmailStatus().organizerEmail,
    })
    if (error) throw new Error(error.message)
    await processContactMeetingQueue({ meetingId: id, userId: actor.id })
    revalidatePath("/")
    revalidatePath(`/high-school/escolas/${entityId}`)
    return { ok: true as const, message: "Reunião cancelada. Histórico preservado; confira o envio do cancelamento por destinatário." }
  } catch (error) { return { ok: false as const, message: errorMessage(error) } }
}

export async function retryContactMeeting(entity: ContactMeetingEntity, entityId: string, id: string) {
  try {
    assertUuid(id)
    const { actor, client } = await context(entity, entityId, true)
    const { data, error } = await client.from("contact_meetings").select("responsible_user_id")
      .eq("id", id).eq(entity === "company" ? "company_id" : "school_id", entityId).maybeSingle()
    if (error || data?.responsible_user_id !== actor.id) throw new Error("Somente o consultor responsável pode reenviar.")
    const result = await processContactMeetingQueue({ meetingId: id, userId: actor.id })
    if (result.error) throw new Error(result.error)
    return { ok: true as const, message: result.sent ? "Envio processado. Confira os destinatários no histórico." : "Nenhum envio liberado. A pausa permanece ativa ou não há jobs elegíveis." }
  } catch (error) { return { ok: false as const, message: errorMessage(error) } }
}
