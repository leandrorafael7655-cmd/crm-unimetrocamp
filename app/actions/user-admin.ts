"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { requireManager, requireRole } from "@/lib/auth/guards"
import { normalizeRole, type Role } from "@/lib/domain/roles"
import { authRedirectUrl, siteUrl } from "@/lib/auth/urls"
import { profileDisplayName } from "@/lib/domain/user-display"
import { recoveryRedirectUrl } from "@/lib/auth/recovery-email"
import { sendUserRecovery } from "@/app/actions/user-access"

const ROLES: Role[] = ["gerente", "supervisor", "consultor_b2b", "high_school"]

export interface ManagedUser {
  id: string
  full_name: string
  display_name: string
  email: string
  role: Role
  active: boolean
  must_change_password: boolean
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
  return recoveryRedirectUrl()
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
    admin.from("profiles").select("id, full_name, email, role, active, consultant_tag, must_change_password").in("id", ids),
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
        display_name: profileDisplayName({ full_name: p?.full_name || meta.full_name, consultant_tag: p?.consultant_tag || meta.consultant_tag }, u.email?.split("@")[0] || "Sem nome"),
        email: p?.email || u.email || "",
        role: normalizeRole(p?.role),
        active: p?.active === true,
        must_change_password: p?.must_change_password === true,
        consultant_tag: p?.consultant_tag || meta.consultant_tag || null,
        email_confirmed: Boolean(u.email_confirmed_at),
        created_at: u.created_at || null,
        attendance_enabled: attendanceById.get(u.id) ?? false,
      }
    })
    .sort((a, b) => a.display_name.localeCompare(b.display_name, "pt-BR"))

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
  const role = input.role
  if (!ROLES.includes(role)) return { ok: false, message: "Perfil inválido." }
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

  const { error: profileError } = await admin.rpc("admin_update_crm_profile", {
    p_actor: actor.id, p_target: data.user.id,
    p_changes: { full_name: fullName, email, role, consultant_tag: consultantTag, active: true },
  })
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

  const mailResult = await sendUserRecovery(data.user.id)
  if (!mailResult.ok) {
    return { ok: true, message: `Usuário criado${input.includeInAttendance ? " e incluído no Atendimento" : ""}, mas não foi possível confirmar a recuperação de acesso. ${mailResult.message} Use “Enviar recuperação” para tentar novamente.${attendanceWarning}` }
  }

  return {
    ok: true,
    message: `Usuário ${fullName} adicionado${input.includeInAttendance ? " e incluído no Atendimento" : ""}. O e-mail cadastrado (${email}) será usado para os convites de calendário. Enviamos também o fluxo para definir a senha.${attendanceWarning}`,
  }
}

export async function updateManagedUser(input: {
  userId: string
  fullName: string
  email: string
  role: Role
  consultantTag?: string
  includeInAttendance: boolean
}): Promise<UserAdminResult> {
  let actor
  try {
    actor = await requireRole("gerente")
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }

  const userId = input.userId.trim()
  const fullName = input.fullName.trim()
  const email = input.email.trim().toLowerCase()
  const role = input.role
  if (!ROLES.includes(role)) return { ok: false, message: "Perfil inválido." }
  const consultantTag = slugTag(input.consultantTag?.trim() || fullName)

  if (!userId) return { ok: false, message: "Usuário inválido." }
  if (!fullName) return { ok: false, message: "Informe o nome completo." }
  if (!validEmail(email)) return { ok: false, message: "Informe um e-mail válido." }
  if (!consultantTag) return { ok: false, message: "Informe um Nome no CRM (Tag) válido." }

  const admin = createAdminClient()
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,full_name,email,role,active,consultant_tag")
    .eq("id", userId)
    .maybeSingle()
  if (profileError) return { ok: false, message: `Falha ao localizar usuário: ${profileError.message}` }
  if (!profile) return { ok: false, message: "Usuário não encontrado." }

  const currentRole = normalizeRole(profile.role)
  if (actor.role !== "gerente" && (currentRole === "gerente" || role === "gerente")) {
    return { ok: false, message: "Somente a gerência pode editar um gerente ou atribuir esse perfil." }
  }
  if (userId === actor.id && role !== actor.role) {
    return { ok: false, message: "Você não pode alterar o próprio perfil de acesso." }
  }

  if (currentRole === "gerente" && role !== "gerente" && profile.active) {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "gerente")
      .eq("active", true)
      .neq("id", userId)
    if ((count ?? 0) === 0) {
      return { ok: false, message: "Não é possível remover o perfil do último gerente ativo." }
    }
  }

  const { data: authData, error: authListError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (authListError) return { ok: false, message: `Falha ao validar conta: ${authListError.message}` }
  const authUsers = authData.users ?? []
  const targetAuth = authUsers.find((u) => u.id === userId && !isDeletedAuthUser(u))
  if (!targetAuth) return { ok: false, message: "Conta de autenticação não encontrada ou já excluída." }
  const emailDuplicate = authUsers.find(
    (u) => u.id !== userId && !isDeletedAuthUser(u) && u.email?.toLowerCase() === email,
  )
  if (emailDuplicate) return { ok: false, message: "Já existe outro usuário cadastrado com este e-mail." }

  const { data: duplicateTags, error: tagError } = await admin
    .from("profiles")
    .select("id")
    .eq("consultant_tag", consultantTag)
    .neq("id", userId)
    .limit(1)
  if (tagError) return { ok: false, message: `Falha ao validar a Tag: ${tagError.message}` }
  if ((duplicateTags ?? []).length > 0) {
    return { ok: false, message: "Esse Nome no CRM (Tag) já está sendo usado por outro usuário." }
  }

  const previousMetadata = (targetAuth.user_metadata ?? {}) as Record<string, unknown>
  const previousEmail = targetAuth.email || profile.email || ""
  if (actor.role !== "gerente" && previousEmail.toLowerCase() !== email) {
    return { ok: false, message: "Somente o Gerente Comercial pode alterar o e-mail de acesso." }
  }
  const nextMetadata = {
    ...previousMetadata,
    full_name: fullName,
    role,
    consultant_tag: consultantTag,
  }

  const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
    user_metadata: nextMetadata,
  })
  if (authUpdateError) return { ok: false, message: `Falha ao atualizar acesso: ${authUpdateError.message}` }

  const { error: profileUpdateError } = await admin.rpc("admin_update_crm_profile", {
    p_actor: actor.id, p_target: userId,
    p_changes: { full_name: fullName, email, role, consultant_tag: consultantTag },
  })
  if (profileUpdateError) {
    await admin.auth.admin.updateUserById(userId, {
      email: previousEmail || undefined,
      email_confirm: true,
      user_metadata: previousMetadata,
    })
    return { ok: false, message: `Falha ao atualizar perfil: ${profileUpdateError.message}` }
  }

  let attendanceWarning = ""
  const { error: attendanceError } = await admin.from("attendance_members").upsert(
    { user_id: userId, enabled: input.includeInAttendance, created_by: actor.id },
    { onConflict: "user_id" },
  )
  if (attendanceError) {
    attendanceWarning = ` Participação no Atendimento não pôde ser atualizada: ${attendanceError.message}`
  } else if (!input.includeInAttendance) {
    const { error: unlinkError } = await admin
      .from("attendance_team_slots")
      .update({ user_id: null, updated_by: actor.id })
      .eq("user_id", userId)
    if (unlinkError) attendanceWarning = ` O usuário saiu do Atendimento, mas o rodízio precisa ser revisado: ${unlinkError.message}`
  }

  const emailChanged = previousEmail.toLowerCase() !== email
  return {
    ok: true,
    message: `Usuário atualizado com sucesso. Nome operacional: ${profileDisplayName({ full_name: fullName, consultant_tag: consultantTag })}.${emailChanged ? " O novo e-mail será usado nos próximos envios e convites." : ""}${attendanceWarning}`,
  }
}

export async function sendPasswordRecovery(emailInput: string): Promise<UserAdminResult> {
  // Compatibility for existing callers; resolve a canonical profile, never an arbitrary email.
  try {
    await requireRole("gerente")
    const { data } = await createAdminClient().from("profiles").select("id").eq("email", emailInput.trim().toLowerCase()).maybeSingle()
    if (!data) return { ok: false, message: "Colaborador não encontrado." }
    return sendUserRecovery(data.id)
  } catch {
    return { ok: false, message: "Operação restrita ao Gerente Comercial." }
  }
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

  const { count: portfolioCount, error: portfolioError } = await admin.from("companies").select("id", { count: "exact", head: true }).eq("owner_id", userId)
  if (portfolioError) return { ok: false, message: "Não foi possível verificar a carteira B2B." }
  if (portfolioCount) return { ok: false, message: `Redistribua as ${portfolioCount} empresas em B2B → Desligar consultor da carteira antes de excluir o acesso.` }

  // Lock out access before Auth deletion. The database guard serializes this
  // check with any concurrent company assignment and preserves historical names.
  const { error: deactivateError } = await admin.rpc("admin_update_crm_profile", { p_actor: actor.id, p_target: userId, p_changes: { active: false } })
  if (deactivateError) return { ok: false, message: deactivateError.message }

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

  const [profileUpdate, memberDelete, slotUpdate, schoolOwner, schoolActions, attendanceFuture, routePreference] = await Promise.all([
    admin.from("profiles").update({ active: false }).eq("id", userId),
    admin.from("attendance_members").delete().eq("user_id", userId),
    admin.from("attendance_team_slots").update({ user_id: null, updated_by: actor.id }).eq("user_id", userId),
    admin.from("schools").update({ primary_owner_id: null }).eq("primary_owner_id", userId),
    admin.from("school_actions").update({ primary_owner_id: null }).eq("primary_owner_id", userId).gte("action_date", today).neq("status", "realizada").neq("status", "cancelada"),
    admin.from("attendance_occurrences").update({ user_id: null, status: "cancelled", cancelled_at: now, updated_by: actor.id }).eq("user_id", userId).gte("occurrence_date", today).neq("status", "cancelled"),
    admin.from("route_user_preferences").delete().eq("user_id", userId),
  ])

  collect("Perfil histórico", profileUpdate.error)
  collect("Participação no Atendimento", memberDelete.error)
  collect("Rodízio do Atendimento", slotUpdate.error)
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

/** All legacy and current callers converge on the same guarded database command. */
export async function changeManagedRole(userId: string, role: Role): Promise<UserAdminResult> {
  try {
    const actor = await requireRole("gerente")
    if (!ROLES.includes(role)) return { ok: false, message: "Perfil inválido." }
    const { error } = await createAdminClient().rpc("admin_update_crm_profile", {
      p_actor: actor.id, p_target: userId, p_changes: { role },
    })
    return error ? { ok: false, message: error.message } : { ok: true, message: "Perfil atualizado." }
  } catch { return { ok: false, message: "Operação restrita ao Gerente Comercial." } }
}

export async function setManagedActive(userId: string, active: boolean): Promise<UserAdminResult> {
  try {
    const actor = await requireRole("gerente")
    const admin = createAdminClient()
    if (active) {
      const { error: unbanError } = await admin.auth.admin.updateUserById(userId, { ban_duration:"none" })
      if (unbanError) return { ok:false,message:"Não foi possível reativar no provedor. O perfil continua bloqueado." }
    }
    const { error } = await admin.rpc("admin_update_crm_profile", {
      p_actor: actor.id, p_target: userId, p_changes: { active },
    })
    if (error) return { ok: false, message: error.message }
    const authError = active ? null : (await admin.auth.admin.updateUserById(userId,{ban_duration:"876000h"})).error
    if (authError) return { ok: false, message: "Perfil atualizado; o bloqueio no provedor precisa de revisão. " + authError.message }
    return { ok: true, message: active ? "Acesso ativado." : "Acesso desativado." }
  } catch { return { ok: false, message: "Operação restrita ao Gerente Comercial." } }
}
