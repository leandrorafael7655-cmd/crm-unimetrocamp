import "server-only"
import { createClient } from "@/lib/supabase/server"
import { type Role, type Permission, can, normalizeRole } from "@/lib/domain/roles"

export type { Role, Permission }

export interface ActorProfile {
  id: string
  email: string | null
  full_name: string
  role: Role
  active: boolean
  consultant_tag: string | null
}

/** Perfil do usuário autenticado no request atual (ou null). */
export async function getActor(): Promise<ActorProfile | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, active, consultant_tag")
    .eq("id", user.id)
    .maybeSingle()

  if (!profile) return null
  // O papel do banco pode estar em valor legado ("consultor"); normaliza para
  // o canônico sem NUNCA conceder privilégio a um valor desconhecido.
  return { ...profile, role: normalizeRole(profile.role) } as ActorProfile
}

/** Exige um ator autenticado e ativo (qualquer papel). */
export async function requireActor(): Promise<ActorProfile> {
  const actor = await getActor()
  if (!actor) throw new Error("Não autenticado.")
  if (!actor.active) throw new Error("Seu acesso está desativado. Procure a gerência.")
  return actor
}

/** Exige um ator ativo com papel de gerente ou supervisor. */
export async function requireManager(): Promise<ActorProfile> {
  const actor = await requireActor()
  if (actor.role !== "gerente" && actor.role !== "supervisor") {
    throw new Error("Ação restrita à gerência ou supervisão.")
  }
  return actor
}

/** Exige um ator ativo cujo papel esteja entre os informados. */
export async function requireRole(...roles: Role[]): Promise<ActorProfile> {
  const actor = await requireActor()
  if (!roles.includes(actor.role)) {
    throw new Error("Você não tem permissão para esta ação.")
  }
  return actor
}

/** Exige um ator ativo que possua a permissão informada. */
export async function requireCan(p: Permission): Promise<ActorProfile> {
  const actor = await requireActor()
  if (!can(actor.role, p)) {
    throw new Error("Você não tem permissão para esta ação.")
  }
  return actor
}

export function isManagerRole(role?: string | null): boolean {
  const r = normalizeRole(role)
  return r === "gerente" || r === "supervisor"
}
