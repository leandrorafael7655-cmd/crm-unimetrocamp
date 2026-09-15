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

  const authUsers = authData.users ?? []
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
  if (existingList.users.some((u) => u.email?.toLowerCase() === email)) {
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
    await admin.auth.admin.deleteUser(data.user.id)
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

  const { error: authError } = await admin.auth.admin.deleteUser(userId)
  if (authError) return { ok: false, message: `Falha ao excluir o acesso: ${authError.message}` }

  await admin.from("attendance_members").upsert({ user_id: userId, enabled: false, created_by: actor.id }, { onConflict: "user_id" })
  await admin.from("attendance_team_slots").update({ user_id: null, updated_by: actor.id }).eq("user_id", userId)

  const { error: archiveError } = await admin.from("profiles").update({ active: false, consultant_tag: null }).eq("id", userId)
  if (archiveError) {
    return { ok: true, message: "A conta de acesso foi excluída. O perfil histórico permaneceu ativo no banco e deve ser revisado pela gerência." }
  }
  return { ok: true, message: `Usuário ${profile.full_name || profile.email || "selecionado"} excluído. O acesso foi removido, a participação futura no Atendimento foi desativada e o histórico comercial foi preservado.` }
}
