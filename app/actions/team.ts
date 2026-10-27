"use server"

import { timingSafeEqual } from "node:crypto"
import { siteUrl } from "@/lib/auth/urls"
import { passwordValidation } from "@/lib/auth/password-policy"
import { addUser, changeManagedRole, setManagedActive } from "@/app/actions/user-admin"
import { createTemporaryPassword } from "@/app/actions/user-access"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireRole, type Role } from "@/lib/auth/guards"

export interface Credenciais {
  email: string
  senha: string
  loginUrl: string
}

export interface ActionResult {
  ok: boolean
  message: string
  /**
   * Credenciais provisórias para compartilhar com o usuário.
   * O acesso é criado direto (sem depender de envio de e-mail); o usuário
   * troca a senha no primeiro acesso, dentro do app.
   */
  credenciais?: Credenciais
}


function slugTag(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/** Existe algum gerente ativo? Usado para gate do bootstrap. */
export async function managerExists(): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const { count, error } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "gerente")
      .eq("active", true)
    if (error) throw error
    return (count ?? 0) > 0
  } catch {
    return true
  }
}

/**
 * Bootstrap idempotente do primeiro gerente.
 * Só funciona enquanto NÃO existir nenhum gerente ativo.
 * Se INITIAL_ADMIN_EMAIL estiver definido, o e-mail informado precisa coincidir.
 */
export async function bootstrapAdmin(input: {
  fullName: string
  email: string
  password: string
  setupToken?: string
}): Promise<ActionResult> {
  const email = input.email.trim().toLowerCase()
  const fullName = input.fullName.trim()

  if (!fullName) return { ok: false, message: "Informe o nome completo." }
  if (!validEmail(email)) return { ok: false, message: "Informe um e-mail válido." }
  const passwordError = passwordValidation(input.password, input.password)
  if (passwordError) return { ok: false, message: passwordError }

  if (await managerExists()) {
    return {
      ok: false,
      message: "Já existe um gerente configurado. Use a tela de login.",
    }
  }

  const required = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase()
  const expectedToken = process.env.INITIAL_ADMIN_SETUP_TOKEN || ""
  const providedToken = input.setupToken || ""
  const tokenValid = expectedToken.length >= 32 && providedToken.length === expectedToken.length && timingSafeEqual(Buffer.from(expectedToken), Buffer.from(providedToken))
  if (!required || required !== email || !tokenValid) {
    return {
      ok: false,
      message: "Este e-mail não está autorizado como administrador inicial.",
    }
  }

  const admin = createAdminClient()
  const tag = slugTag(fullName || email.split("@")[0])

  // Reaproveita usuário existente (ex.: conta de teste) ou cria um novo.
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const existing = list?.users.find((u) => u.email?.toLowerCase() === email)

  let userId: string
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: "gerente", consultant_tag: tag },
    })
    if (error) return { ok: false, message: `Falha ao promover conta: ${error.message}` }
    userId = existing.id
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: "gerente", consultant_tag: tag },
    })
    if (error || !data.user)
      return { ok: false, message: `Falha ao criar conta: ${error?.message ?? "desconhecido"}` }
    userId = data.user.id
  }

  const { error: upErr } = await admin.rpc("bootstrap_crm_profile", {
    p_target: userId, p_name: fullName, p_email: email, p_tag: tag,
  })
  if (upErr) return { ok: false, message: `Falha ao criar perfil: ${upErr.message}` }

  return { ok: true, message: "Administrador criado. Faça login para continuar." }
}

/** Compatibility exports share the current server authorization and access audit. */
export async function inviteUser(input: { fullName: string; email: string; role: Role; consultantTag?: string }): Promise<ActionResult> {
  return addUser(input)
}

export async function changeRole(userId: string, role: Role): Promise<ActionResult> {
  return changeManagedRole(userId, role)
}

export async function setActive(userId: string, active: boolean): Promise<ActionResult> {
  return setManagedActive(userId, active)
}

async function temporaryAccess(email: string): Promise<ActionResult> {
  try {
    await requireRole("gerente")
    const clean = email.trim().toLowerCase()
    const { data, error } = await createAdminClient().from("profiles").select("id,email").eq("email", clean).maybeSingle()
    if (error || !data) return { ok: false, message: "Colaborador não encontrado." }
    const result = await createTemporaryPassword(data.id)
    return { ok: result.ok, message: result.message,
      ...(result.ok && result.temporaryPassword ? { credenciais: { email: data.email, senha: result.temporaryPassword, loginUrl: `${siteUrl() || "https://uniconecta-crm.vercel.app"}/auth/login` } } : {}) }
  } catch { return { ok: false, message: "Operação restrita ao Gerente Comercial." } }
}

export async function resendInvite(email: string): Promise<ActionResult> { return temporaryAccess(email) }
export async function resetPassword(email: string): Promise<ActionResult> { return temporaryAccess(email) }

export interface Diagnostic {
  kind:
    | "auth_sem_perfil"
    | "perfil_sem_role"
    | "inativo"
    | "nao_confirmado"
    | "tag_duplicada"
    | "conta_teste"
    | "sem_gerente"
  userId?: string
  email?: string
  detail: string
  fixable: boolean
}

const TEST_PATTERNS = /(test|teste|exemplo|demo|\+test|mailinator|example\.)/i

/** Diagnóstico de contas inconsistentes (somente gerência). */
export async function runDiagnostics(): Promise<
  { ok: false; message: string } | { ok: true; items: Diagnostic[] }
> {
  try {
    await requireRole("gerente")
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }

  const admin = createAdminClient()
  const items: Diagnostic[] = []

  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const users = list?.users ?? []
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, role, active, consultant_tag")

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  // Auth sem perfil
  for (const u of users) {
    if (!profileById.has(u.id)) {
      items.push({
        kind: "auth_sem_perfil",
        userId: u.id,
        email: u.email ?? undefined,
        detail: "Usuário do Auth sem perfil correspondente.",
        fixable: true,
      })
    }
    if (!u.email_confirmed_at) {
      items.push({
        kind: "nao_confirmado",
        userId: u.id,
        email: u.email ?? undefined,
        detail: "E-mail ainda não confirmado.",
        fixable: false,
      })
    }
    if (u.email && TEST_PATTERNS.test(u.email)) {
      items.push({
        kind: "conta_teste",
        userId: u.id,
        email: u.email,
        detail: "Aparenta ser conta de teste.",
        fixable: false,
      })
    }
  }

  // Perfis
  const tagCount = new Map<string, number>()
  for (const p of profiles ?? []) {
    if (!p.role) {
      items.push({
        kind: "perfil_sem_role",
        userId: p.id,
        email: p.email ?? undefined,
        detail: "Perfil sem papel definido.",
        fixable: true,
      })
    }
    if (!p.active) {
      items.push({
        kind: "inativo",
        userId: p.id,
        email: p.email ?? undefined,
        detail: "Usuário desativado.",
        fixable: false,
      })
    }
    if (p.consultant_tag) {
      tagCount.set(p.consultant_tag, (tagCount.get(p.consultant_tag) ?? 0) + 1)
    }
  }
  for (const [tag, n] of tagCount) {
    if (n > 1)
      items.push({
        kind: "tag_duplicada",
        detail: `Tag de consultor duplicada: "${tag}" (${n} perfis).`,
        fixable: false,
      })
  }

  if (!(await managerExists())) {
    items.push({
      kind: "sem_gerente",
      detail: "Nenhum gerente ativo encontrado.",
      fixable: false,
    })
  }

  return { ok: true, items }
}

/** Cria o perfil ausente para um usuário do Auth (correção segura). */
export async function fixMissingProfile(userId: string): Promise<ActionResult> {
  try {
    await requireRole("gerente")
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.getUserById(userId)
  if (error || !data.user) return { ok: false, message: "Usuário não encontrado no Auth." }

  const u = data.user
  const meta = (u.user_metadata ?? {}) as Record<string, string>
  const fullName = meta.full_name || u.email?.split("@")[0] || "Sem nome"
  const role: Role = "consultor_b2b"

  const { data: existingProfile, error: lookupError } = await admin.from("profiles").select("id").eq("id",u.id).maybeSingle()
  if (lookupError || existingProfile) return { ok:false,message:"O perfil já existe ou não pôde ser verificado. Use a gestão de usuários." }
  const { error: upErr } = await admin.from("profiles").insert({
    id:u.id,full_name:fullName,email:u.email,role,consultant_tag:null,active:false,
  })
  if (upErr) return { ok: false, message: `Falha ao criar perfil: ${upErr.message}` }
  return { ok: true, message: "Perfil criado com sucesso." }
}
