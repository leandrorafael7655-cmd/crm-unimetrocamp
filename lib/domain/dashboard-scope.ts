import { can, type Role } from "./roles"

/**
 * Quais blocos do Painel Geral um papel enxerga, e com que abrangência.
 * Regras derivadas exclusivamente da matriz de permissões (roles.ts), para
 * que cliente e servidor concordem e o escopo seja testável isoladamente.
 */
export interface DashboardScope {
  verB2B: boolean
  /** true = consultor vê apenas a própria carteira (sem b2b.read.all). */
  soCarteiraPropria: boolean
  verHS: boolean
  verSV: boolean
  verMetas: boolean
  /** true = metas de todos; false = apenas as próprias. */
  metasGlobais: boolean
  verMapa: boolean
}

export function escopoDashboard(role: Role | string | null | undefined): DashboardScope {
  const verMetasAll = can(role, "goals.read.all")
  return {
    verB2B: can(role, "b2b.read.all") || can(role, "b2b.read.own"),
    soCarteiraPropria: !can(role, "b2b.read.all") && can(role, "b2b.read.own"),
    verHS: can(role, "hs.read"),
    verSV: can(role, "supervest.read"),
    verMetas: can(role, "goals.read.own") || verMetasAll,
    metasGlobais: verMetasAll,
    verMapa: can(role, "map.read"),
  }
}
