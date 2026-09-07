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
]

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  // Gerente: todas.
  gerente: TODAS,

  // Supervisor: todas exceto settings.write (só leitura de configuração),
  // mantendo goals.write, supervest.write e team.manage.
  supervisor: TODAS.filter((p) => p !== "settings.write"),

  // Consultor B2B: carteira própria + leitura global (a busca "De quem é?"
  // exige b2b.read.all e é o antídoto contra prospecção duplicada).
  // SEM hs.write, SEM goals.write, SEM b2b.transfer.
  consultor_b2b: [
    "b2b.read.all",
    "b2b.read.own",
    "b2b.write",
    "hs.read",
    "supervest.read",
    "goals.read.own",
    "map.read",
    "routes.plan",
  ],

  // High School: dono do módulo HS + divulgação SuperVest. SEM b2b.write.
  high_school: [
    "hs.read",
    "hs.write",
    "b2b.read.all",
    "supervest.read",
    "supervest.write",
    "goals.read.own",
    "map.read",
    "routes.plan",
  ],
}

/** Verdadeiro se o papel (canônico ou legado) tem a permissão pedida. */
export function can(role: Role | string | null | undefined, p: Permission): boolean {
  const r = normalizeRole(typeof role === "string" ? role : role ?? undefined)
  return ROLE_PERMISSIONS[r].includes(p)
}

/** Rótulo humano do papel para exibição na UI. */
export function rotuloRole(role: Role | string | null | undefined): string {
  switch (normalizeRole(typeof role === "string" ? role : role ?? undefined)) {
    case "gerente":
      return "Gerente"
    case "supervisor":
      return "Supervisor"
    case "high_school":
      return "High School"
    default:
      return "Consultor B2B"
  }
}
