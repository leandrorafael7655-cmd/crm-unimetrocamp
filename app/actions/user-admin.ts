"use server"

import { headers } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireManager, requireRole } from "@/lib/auth/guards"
import { normalizeRole, type Role } from "@/lib/domain/roles"
import { authRedirectUrl, siteUrl } from "@/lib/auth/urls"

const ROLES: Role[] = ["gerente", "supervisor", "consultor_b2b", "high_school"]

export interface ManagedUser {
  id: string
  full_name: string
  email: string
  role: Role
  active: boolean
  consultant_tag: string | null
  email_confirmed: boolean
  created_at: string | null
  attendance_enabled: boolean
}

export type UserAdminResult =
  | { ok: true; message: string }
  | { ok: false; message: string }

export type ManagedUsersResult =
  | { ok: true; users: ManagedUser[] }
  | { ok: false; message: string; users: ManagedUser[] }

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function slugTag(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function isDeletedAuthUser(user: unknown): boolean {
  return Boolean((user as { deleted_at?: string | null } | null)?.deleted_at)
}

async function resetRedirectUrl(): Promise<string> {
  try {
    const h = await headers()
    const host = h.get("x-forwarded-host") ?? h.get("host")
    const proto = h.get("x-forwarded-proto") ?? "https"
    if (host) return authRedirectUrl(`${proto}://${host}`, "/auth/reset-password")
  } catch {
    // Usa a URL pública configurada quando não houver request disponível.
  }
  return authRedirectUrl(siteUrl(), "/auth/reset-password")
}

export async function listManagedUsers(): Promise<ManagedUsersResult> {
  try {
    await requireManager()
  } catch (e) {
    return { ok: false, message: (e as Error).message, users: [] }
  }

  const admin = createAdminClient()
  const { data: authData, error: authError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (authError) return { ok: false, message: `Falha ao listar usuários: ${authError.message}`, users: [] }

  // Contas excluídas em modo seguro permanecem fisicamente no Auth apenas para
  // preservar FKs/histórico. Elas não devem reaparecer na Gestão de Usuários.
  const authUsers = (authData.users ?? []).filter((u) => !isDeletedAuthUser(u))
  if (authUsers.length === 0) return { ok: true, users: [] }

  const ids = authUsers.map((u) => u.id)
  const [{ data: profiles, error: profileError }, { data: attendanceRows, error: attendanceError }] = await Promise.all([
    admin.from("profiles").select("id, full_name, email, role, active, consultant_tag").in("id", ids),
    admin.from("attendance_members").select("user_id,enabled").in("user_id", ids),
  ])

  if (profileError) return { ok: false, message: `Falha ao carregar perfis: ${profileError.message}`, users: [] }
  if (attendanceError) return { ok: false, message: `Falha ao carregar participação no Atendimento: ${attendanceError.message}`, users: [] }

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]))
  const attendanceById = new Map((attendanceRows ?? []).map((m) => [m.user_id, Boolean(m.enabled)]))
  const users: ManagedUser[] = authUsers
    .map((u) => {
      const p = byId.get(u.id)
      const meta = (u.user_metadata ?? {}) as Record<string, string>
      return {
        id: u.id,
        full_name: p?.full_name || meta.full_name || u.email?.split("@")[0] || "Sem nome",
        email: p?.email || u.email || "",
        role: normalizeRole(p?.role || meta.role),
        active: p?.active !== false,
        consultant_tag: p?.consultant_tag || meta.consultant_tag || null,
        email_confirmed: Boolean(u.email_confirmed_at),
        created_at: u.created_at || null,
        attendance_enabled: attendanceById.get(u.id) ?? false,
      }
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR"))

  return { ok: true, users }
}

/**
 * Cria a conta sem senha inicial e envia e-mail para o próprio usuário definir a
 * senha. Se `includeInAttendance` estiver ativo, o mesmo usuário/e-mail passa a
 * ficar disponível no módulo Atendimento e nos convites de calendário.
 */
export async function addUser(input: {
  fullName: string
  email: string
  role: Role
  consultantTag?: string
  includeInAttendance?: boolean
}): Promise<UserAdminResult> {
  let actor
  try {
    actor = await requireRole("gerente")
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }

  const fullName = input.fullName.trim()
  const email = input.email.trim().toLowerCase()
  const role: Role = ROLES.includes(input.role) ? input.role : "consultor_b2b"
  const consultantTag = slugTag(input.consultantTag?.trim() || fullName)

  if (!fullName) return { ok: false, message: "Informe o nome completo." }
  if (!validEmail(email)) return { ok: false, message: "Informe um e-mail válido." }

  const admin = createAdminClient()
  const { data: existingList, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listError) return { ok: false, message: `Falha ao validar o e-mail: ${listError.message}` }
  if (existingList.users.some((u) => !isDeletedAuthUser(u) && u.email?.toLowerCase() === email)) {
    return { ok: false, message: "Já existe um usuário cadastrado com este e-mail." }
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName, role, consultant_tag: consultantTag },
  })

  if (error || !data.user) return { ok: false, message: `Falha ao criar usuário: ${error?.message ?? "erro desconhecido"}` }

  const { error: profileError } = await admin.from("profiles").upsert(
    { id: data.user.id, full_name: fullName, email, role, consultant_tag: consultantTag, active: true },
    { onConflict: "id" },
  )
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id, true)
    return { ok: false, message: `Falha ao criar o perfil: ${profileError.message}` }
  }

  let attendanceWarning = ""
  if (input.includeInAttendance) {
    const { error: attendanceError } = await admin.from("attendance_members").upsert(
      { user_id: data.user.id, enabled: true, created_by: actor.id },
      { onConflict: "user_id" },
    )
    if (attendanceError) attendanceWarning = " O usuário foi criado, mas não foi possível incluí-lo automaticamente no Atendimento."
  }

  const redirectTo = await resetRedirectUrl()
  const { error: mailError } = await admin.auth.resetPasswordForEmail(email, { redirectTo })
  if (mailError) {
    return { ok: true, message: `Usuário criado${input.includeInAttendance ? " e incluído no Atendimento" : ""}, mas o e-mail para definir a senha não pôde ser enviado agora. Use “Enviar recuperação” para tentar novamente.${attendanceWarning}` }
  }

  return {
    ok: true,
    message: `Usuário ${fullName} adicionado${input.includeInAttendance ? " e incluído no Atendimento" : ""}. O e-mail cadastrado (${email}) será usado para os convites de calendário. Enviamos também o fluxo para definir a senha.${attendanceWarning}`,
  }
}

export async function sendPasswordRecovery(emailInput: string): Promise<UserAdminResult> {
  try {
    await requireManager()
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
  const email = emailInput.trim().toLowerCase()
  if (!validEmail(email)) return { ok: false, message: "E-mail inválido." }
  const admin = createAdminClient()
  const redirectTo = await resetRedirectUrl()
  const { error } = await admin.auth.resetPasswordForEmail(email, { redirectTo })
  if (error) return { ok: false, message: `Não foi possível enviar a recuperação: ${error.message}` }
  return { ok: true, message: `E-mail de recuperação enviado para ${email}.` }
}

async function cancelFutureCalendarEventsForUser(userId: string, actorId: string): Promise<string[]> {
  const admin = createAdminClient()
  const warnings: string[] = []
  const { data: events, error } = await admin
    .from("calendar_events")
    .select("id,sequence")
    .eq("recipient_user_id", userId)
    .eq("status", "active")
    .gte("end_at", new Date().toISOString())

  if (error) return [`Não foi possível revisar convites futuros: ${error.message}`]

  for (const event of events ?? []) {
    const sequence = Number(event.sequence ?? 0) + 1
    const { error: eventError } = await admin
      .from("calendar_events")
      .update({ status: "cancelled", sequence, updated_by: actorId })
      .eq("id", event.id)
    if (eventError) {
      warnings.push(`Falha ao cancelar evento ${event.id}: ${eventError.message}`)
      continue
    }

    const { error: jobError } = await admin.from("calendar_invite_jobs").upsert(
      {
        calendar_event_id: event.id,
        operation: "CANCEL",
        event_sequence: sequence,
        idempotency_key: `${event.id}:CANCEL:${sequence}`,
        status: "pending",
        attempts: 0,
        last_error: null,
        next_attempt_at: null,
      },
      { onConflict: "idempotency_key", ignoreDuplicates: true },
    )
    if (jobError) warnings.push(`Falha ao enfileirar cancelamento ${event.id}: ${jobError.message}`)
  }

  return warnings
}

/**
 * Remove o acesso sem apagar o histórico referenciado pelo CRM.
 *
 * O Auth usa soft-delete: a conta perde o login imediatamente, mas a linha física
 * permanece para que `profiles` e todos os históricos com FK continuem íntegros.
 * A Gestão de Usuários ignora contas soft-deleted, portanto elas desaparecem da UI.
 */
export async function deleteUser(userId: string): Promise<UserAdminResult> {
  let actor
  try {
    actor = await requireRole("gerente")
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
  if (userId === actor.id) return { ok: false, message: "Você não pode excluir a própria conta." }

  const admin = createAdminClient()
  const { data: profile, error: profileError } = await admin.from("profiles").select("id, full_name, email, role, active").eq("id", userId).maybeSingle()
  if (profileError) return { ok: false, message: `Falha ao localizar o usuário: ${profileError.message}` }
  if (!profile) return { ok: false, message: "Usuário não encontrado." }

  if (normalizeRole(profile.role) === "gerente" && profile.active) {
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "gerente").eq("active", true)
    if ((count ?? 0) <= 1) return { ok: false, message: "Não é possível excluir o último administrador ativo." }
  }

  // Soft-delete é essencial: profiles.id referencia auth.users com ON DELETE CASCADE,
  // enquanto diversos históricos referenciam profiles com RESTRICT/NO ACTION.
  // Um hard-delete do Auth tentaria apagar profiles e seria bloqueado pelo banco.
  const { error: authError } = await admin.auth.admin.deleteUser(userId, true)
  if (authError) return { ok: false, message: `Falha ao excluir o acesso: ${authError.message}` }

  const warnings: string[] = []
  const collect = (label: string, error?: { message: string } | null) => {
    if (error) warnings.push(`${label}: ${error.message}`)
  }

  // Cancela convites futuros antes de retirar as atribuições operacionais.
  warnings.push(...await cancelFutureCalendarEventsForUser(userId, actor.id))

  const today = new Date().toISOString().slice(0, 10)
  const now = new Date().toISOString()

  const [profileUpdate, memberDelete, slotUpdate, companyOwner, companyNextOwner, schoolOwner, schoolActions, attendanceFuture, routePreference] = await Promise.all([
    admin.from("profiles").update({ active: false, consultant_tag: null }).eq("id", userId),
    admin.from("attendance_members").delete().eq("user_id", userId),
    admin.from("attendance_team_slots").update({ user_id: null, updated_by: actor.id }).eq("user_id", userId),
    admin.from("companies").update({ owner_id: null }).eq("owner_id", userId),
    admin.from("companies").update({ next_action_owner_id: null }).eq("next_action_owner_id", userId),
    admin.from("schools").update({ primary_owner_id: null }).eq("primary_owner_id", userId),
    admin.from("school_actions").update({ primary_owner_id: null }).eq("primary_owner_id", userId).gte("action_date", today).neq("status", "realizada").neq("status", "cancelada"),
    admin.from("attendance_occurrences").update({ user_id: null, status: "cancelled", cancelled_at: now, updated_by: actor.id }).eq("user_id", userId).gte("occurrence_date", today).neq("status", "cancelled"),
    admin.from("route_user_preferences").delete().eq("user_id", userId),
  ])

  collect("Perfil histórico", profileUpdate.error)
  collect("Participação no Atendimento", memberDelete.error)
  collect("Rodízio do Atendimento", slotUpdate.error)
  collect("Carteira B2B", companyOwner.error)
  collect("Próximos passos B2B", companyNextOwner.error)
  collect("Responsabilidade de escolas", schoolOwner.error)
  collect("Ações futuras de escola", schoolActions.error)
  collect("Escala futura", attendanceFuture.error)
  collect("Preferências privadas de rota", routePreference.error)

  const label = profile.full_name || profile.email || "selecionado"
  if (warnings.length) {
    return {
      ok: true,
      message: `O acesso de ${label} foi excluído e o usuário não pode mais entrar no UniConecta. O histórico foi preservado. Algumas limpezas operacionais precisam de revisão: ${warnings.join(" | ")}`,
    }
  }

  return {
    ok: true,
    message: `Usuário ${label} excluído com sucesso. O acesso foi removido, atribuições futuras foram liberadas, convites futuros foram cancelados e o histórico comercial foi preservado.`,
  }
}
