"use server"

import { headers } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireManager, type Role } from "@/lib/auth/guards"

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

const ROLES: Role[] = ["gerente", "supervisor", "consultor_b2b", "high_school"]

/**
 * Senha temporária legível e forte (maiúscula, minúsculas, dígitos, símbolo).
 * Ex.: "Metro-7Q4K-92". Fácil de repassar, difícil de adivinhar.
 */
function senhaTemporaria(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // sem I/O/0/1
  const bloco = Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("")
  const num = (crypto.getRandomValues(new Uint32Array(1))[0] % 90) + 10
  return `Metro-${bloco.slice(0, 4)}-${bloco.slice(4)}-${num}`
}

/** URL absoluta da tela de login, derivada do request (com fallback). */
async function loginUrl(): Promise<string> {
  try {
    const h = await headers()
    const host = h.get("x-forwarded-host") ?? h.get("host")
    const proto = h.get("x-forwarded-proto") ?? "https"
    if (host) return `${proto}://${host}/auth/login`
  } catch {
    /* fora de request */
  }
  const runtime = process.env.V0_RUNTIME_URL?.replace(/\/+$/, "")
  return runtime ? `${runtime}/auth/login` : "/auth/login"
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
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "gerente")
      .eq("active", true)
    return (count ?? 0) > 0
  } catch {
    return false
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
}): Promise<ActionResult> {
  const email = input.email.trim().toLowerCase()
  const fullName = input.fullName.trim()

  if (!fullName) return { ok: false, message: "Informe o nome completo." }
  if (!validEmail(email)) return { ok: false, message: "Informe um e-mail válido." }
  if (input.password.length < 8)
    return { ok: false, message: "A senha deve ter ao menos 8 caracteres." }

  if (await managerExists()) {
    return {
      ok: false,
      message: "Já existe um gerente configurado. Use a tela de login.",
    }
  }

  const required = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase()
  if (required && required !== email) {
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

  const { error: upErr } = await admin.from("profiles").upsert(
    {
      id: userId,
      full_name: fullName,
      email,
      role: "gerente",
      consultant_tag: tag,
      active: true,
    },
    { onConflict: "id" },
  )
  if (upErr) return { ok: false, message: `Falha ao criar perfil: ${upErr.message}` }

  return { ok: true, message: "Administrador criado. Faça login para continuar." }
}

/** Convida um novo usuário (gerente/supervisor apenas). */
export async function inviteUser(input: {
  fullName: string
  email: string
  role: Role
  consultantTag?: string
}): Promise<ActionResult> {
  let actor
  try {
    actor = await requireManager()
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }

  const email = input.email.trim().toLowerCase()
  const fullName = input.fullName.trim()
  const role: Role = ROLES.includes(input.role) ? input.role : "consultor_b2b"

  if (!fullName) return { ok: false, message: "Informe o nome completo." }
  if (!validEmail(email)) return { ok: false, message: "Informe um e-mail válido." }
  if (role === "gerente" && actor.role !== "gerente") {
    return { ok: false, message: "Somente a gerência pode criar outro gerente." }
  }

  const admin = createAdminClient()
  const tag = slugTag(input.consultantTag?.trim() || fullName)
  const senha = senhaTemporaria()

  // Reaproveita conta existente para o mesmo e-mail, senão cria uma nova.
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const existing = list?.users.find((u) => u.email?.toLowerCase() === email)

  let userId: string
  if (existing) {
    userId = existing.id
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: senha,
      email_confirm: true,
      user_metadata: { full_name: fullName, role, consultant_tag: tag },
    })
    if (error) return { ok: false, message: `Falha ao atualizar conta: ${error.message}` }
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { full_name: fullName, role, consultant_tag: tag },
    })
    if (error || !data.user) {
      return { ok: false, message: `Falha ao criar conta: ${error?.message ?? "desconhecido"}` }
    }
    userId = data.user.id
  }

  const { error: upErr } = await admin.from("profiles").upsert(
    { id: userId, full_name: fullName, email, role, consultant_tag: tag, active: true },
    { onConflict: "id" },
  )
  if (upErr) return { ok: false, message: `Falha ao criar perfil: ${upErr.message}` }

  return {
    ok: true,
    message: `Conta de ${fullName} criada. Compartilhe as credenciais abaixo — a senha deve ser trocada no primeiro acesso.`,
    credenciais: { email, senha, loginUrl: await loginUrl() },
  }
}

/** Regera uma senha provisória para reenviar o acesso. */
export async function resendInvite(email: string): Promise<ActionResult> {
  try {
    await requireManager()
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
  const admin = createAdminClient()
  const clean = email.trim().toLowerCase()
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const u = list?.users.find((x) => x.email?.toLowerCase() === clean)
  if (!u) return { ok: false, message: "Usuário não encontrado." }

  const senha = senhaTemporaria()
  const { error } = await admin.auth.admin.updateUserById(u.id, {
    password: senha,
    email_confirm: true,
  })
  if (error) return { ok: false, message: `Falha ao regenerar acesso: ${error.message}` }

  return {
    ok: true,
    message: `Novo acesso provisório para ${clean}:`,
    credenciais: { email: clean, senha, loginUrl: await loginUrl() },
  }
}

/** Altera o papel de um usuário. */
export async function changeRole(userId: string, role: Role): Promise<ActionResult> {
  let actor
  try {
    actor = await requireManager()
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
  if (!ROLES.includes(role)) return { ok: false, message: "Papel inválido." }
  if (role === "gerente" && actor.role !== "gerente") {
    return { ok: false, message: "Somente a gerência pode promover a gerente." }
  }

  const admin = createAdminClient()
  const { error } = await admin.from("profiles").update({ role }).eq("id", userId)
  if (error) return { ok: false, message: `Falha ao alterar papel: ${error.message}` }
  await admin.auth.admin.updateUserById(userId, { user_metadata: { role } })
  return { ok: true, message: "Papel atualizado." }
}

/** Ativa ou desativa um usuário (preserva histórico comercial). */
export async function setActive(userId: string, active: boolean): Promise<ActionResult> {
  let actor
  try {
    actor = await requireManager()
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
  if (userId === actor.id && !active) {
    return { ok: false, message: "Você não pode desativar a própria conta." }
  }

  const admin = createAdminClient()
  const { error } = await admin.from("profiles").update({ active }).eq("id", userId)
  if (error) return { ok: false, message: `Falha ao atualizar status: ${error.message}` }
  // Bloqueia/reativa o login sem apagar dados.
  await admin.auth.admin.updateUserById(userId, {
    ban_duration: active ? "none" : "876000h",
  })
  return { ok: true, message: active ? "Usuário ativado." : "Usuário desativado." }
}

/** Redefine a senha para uma nova provisória (compartilhável, sem e-mail). */
export async function resetPassword(email: string): Promise<ActionResult> {
  try {
    await requireManager()
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
  const admin = createAdminClient()
  const clean = email.trim().toLowerCase()
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const u = list?.users.find((x) => x.email?.toLowerCase() === clean)
  if (!u) return { ok: false, message: "Usuário não encontrado." }

  const senha = senhaTemporaria()
  const { error } = await admin.auth.admin.updateUserById(u.id, {
    password: senha,
    email_confirm: true,
  })
  if (error) return { ok: false, message: `Falha ao redefinir senha: ${error.message}` }

  return {
    ok: true,
    message: `Senha provisória de ${clean} redefinida:`,
    credenciais: { email: clean, senha, loginUrl: await loginUrl() },
  }
}

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
    await requireManager()
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
    await requireManager()
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.getUserById(userId)
  if (error || !data.user) return { ok: false, message: "Usuário não encontrado no Auth." }

  const u = data.user
  const meta = (u.user_metadata ?? {}) as Record<string, string>
  const fullName = meta.full_name || u.email?.split("@")[0] || "Sem nome"
  const role: Role = ROLES.includes(meta.role as Role) && meta.role !== "gerente"
    ? (meta.role as Role)
    : "consultor_b2b"

  const { error: upErr } = await admin.from("profiles").upsert(
    {
      id: u.id,
      full_name: fullName,
      email: u.email,
      role,
      consultant_tag: meta.consultant_tag || slugTag(fullName),
      active: true,
    },
    { onConflict: "id" },
  )
  if (upErr) return { ok: false, message: `Falha ao criar perfil: ${upErr.message}` }
  return { ok: true, message: "Perfil criado com sucesso." }
}
