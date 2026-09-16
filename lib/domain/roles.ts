/* ─────────────────────────  papéis e permissões  ─────────────────────────
   Fonte única de verdade para autorização no cliente e no servidor.
   O papel canônico vive em `profiles.role`. O valor legado "consultor" é
   normalizado para "consultor_b2b" — NUNCA para um papel privilegiado. */

export type Role = "gerente" | "supervisor" | "consultor_b2b" | "high_school"

/** Compatibilidade: 'consultor' é o valor legado em profiles.role. */
export function normalizeRole(raw?: string | null): Role {
  if (raw === "gerente" || raw === "supervisor" || raw === "high_school") return raw
  if (raw === "consultor_b2b" || raw === "consultor") return "consultor_b2b"
  return "consultor_b2b" // fallback SEM privilégio
}

export type Permission =
  | "b2b.read.all"
  | "b2b.read.own"
  | "b2b.write"
  | "b2b.transfer"
  | "hs.read"
  | "hs.write"
  | "supervest.read"
  | "supervest.write"
  | "goals.read.own"
  | "goals.read.all"
  | "goals.write"
  | "team.manage"
  | "settings.write"
  | "map.read"
  | "routes.plan"
  | "attendance.read"
  | "attendance.manage"

const TODAS: readonly Permission[] = [
  "b2b.read.all",
  "b2b.read.own",
  "b2b.write",
  "b2b.transfer",
  "hs.read",
  "hs.write",
  "supervest.read",
  "supervest.write",
  "goals.read.own",
  "goals.read.all",
  "goals.write",
  "team.manage",
  "settings.write",
  "map.read",
  "routes.plan",
  "attendance.read",
  "attendance.manage",
]

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  gerente: TODAS,
  supervisor: TODAS.filter((p) => p !== "settings.write"),
  consultor_b2b: [
    "b2b.read.all",
    "b2b.read.own",
    "b2b.write",
    "hs.read",
    "supervest.read",
    "goals.read.own",
    "map.read",
    "routes.plan",
    "attendance.read",
  ],
  high_school: [
    "hs.read",
    "hs.write",
    "b2b.read.all",
    "supervest.read",
    "supervest.write",
    "goals.read.own",
    "map.read",
    "routes.plan",
    "attendance.read",
  ],
}

export function can(role: Role | string | null | undefined, p: Permission): boolean {
  const r = normalizeRole(typeof role === "string" ? role : role ?? undefined)
  return ROLE_PERMISSIONS[r].includes(p)
}

export function rotuloRole(role: Role | string | null | undefined): string {
  switch (normalizeRole(typeof role === "string" ? role : role ?? undefined)) {
    case "gerente": return "Gerente"
    case "supervisor": return "Supervisor"
    case "high_school": return "High School"
    default: return "Consultor B2B"
  }
}
