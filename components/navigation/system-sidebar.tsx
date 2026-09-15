"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import {
  Building2,
  Briefcase,
  CalendarClock,
  ChevronDown,
  CircleGauge,
  GraduationCap,
  Handshake,
  Link2,
  MapPinned,
  Route,
  School,
  Search,
  Settings,
  SlidersHorizontal,
  Target,
  Users,
  GitBranch,
} from "lucide-react"
import { can, normalizeRole, rotuloRole } from "@/lib/domain/roles"
import { createClient } from "@/lib/supabase/client"

type GroupKey = "b2b" | "high-school" | "routes" | "settings"
type LegacyView = "painel" | "carteira" | "consulta" | "empresas" | "agenda" | "funil" | "convenios" | "equipe"
type LegacyFocus = "equipe" | "links" | undefined

type RoleInput = string | null | undefined

export interface LegacyB2BSelection {
  view: LegacyView
  focus?: LegacyFocus
}

interface SystemSidebarMenuProps {
  role?: RoleInput
  embedded?: boolean
  activeLegacyView?: LegacyView
  onLegacySelect?: (selection: LegacyB2BSelection) => void
}

const GROUP_LABELS: Record<GroupKey, string> = {
  b2b: "B2B",
  "high-school": "High School",
  routes: "Rotas",
  settings: "Configurações",
}

function groupForPath(pathname: string): GroupKey {
  if (pathname.startsWith("/high-school") || pathname.startsWith("/supervest")) return "high-school"
  if (pathname.startsWith("/mapa")) return "routes"
  if (pathname.startsWith("/gestao")) return "settings"
  return "b2b"
}

function submenuClass(active: boolean) {
  return `flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] transition ${
    active
      ? "bg-white/10 font-medium text-white"
      : "text-[#b4fcf1]/70 hover:bg-white/5 hover:text-white"
  }`
}

function LegacyButton({
  label,
  view,
  focus,
  Icone,
  active,
  embedded,
  onLegacySelect,
}: {
  label: string
  view: LegacyView
  focus?: LegacyFocus
  Icone: typeof Building2
  active: boolean
  embedded: boolean
  onLegacySelect?: (selection: LegacyB2BSelection) => void
}) {
  if (embedded && onLegacySelect) {
    return (
      <button type="button" onClick={() => onLegacySelect({ view, focus })} className={submenuClass(active)}>
        <Icone className="h-4 w-4 shrink-0" />
        <span>{label}</span>
      </button>
    )
  }

  const query = new URLSearchParams({ view })
  if (focus) query.set("focus", focus)
  return (
    <Link href={`/?${query.toString()}`} className={submenuClass(false)}>
      <Icone className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </Link>
  )
}

function NavLink({ href, label, Icone, active }: { href: string; label: string; Icone: typeof Building2; active: boolean }) {
  return (
    <Link href={href} className={submenuClass(active)}>
      <Icone className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </Link>
  )
}

export function SystemSidebarMenu({ role, embedded = false, activeLegacyView = "painel", onLegacySelect }: SystemSidebarMenuProps) {
  const pathname = usePathname()
  const canonicalRole = normalizeRole(role)
  const isManager = canonicalRole === "gerente" || canonicalRole === "supervisor"

  const allowedGroups = useMemo(() => {
    const result: GroupKey[] = []
    if (can(canonicalRole, "b2b.read.all") || can(canonicalRole, "b2b.read.own")) result.push("b2b")
    if (can(canonicalRole, "hs.read")) result.push("high-school")
    if (can(canonicalRole, "map.read") || can(canonicalRole, "routes.plan")) result.push("routes")
    if (
      can(canonicalRole, "goals.read.own") ||
      can(canonicalRole, "goals.read.all") ||
      can(canonicalRole, "team.manage") ||
      can(canonicalRole, "settings.write")
    ) result.push("settings")
    return result
  }, [canonicalRole])

  const inferred = allowedGroups.includes(groupForPath(pathname)) ? groupForPath(pathname) : allowedGroups[0] ?? "b2b"
  const [openGroup, setOpenGroup] = useState<GroupKey | null>(inferred)

  useEffect(() => {
    const current = groupForPath(pathname)
    if (allowedGroups.includes(current)) setOpenGroup(current)
  }, [pathname, allowedGroups])

  const toggle = (group: GroupKey) => setOpenGroup((current) => (current === group ? null : group))

  return (
    <div className={embedded ? "px-2 py-2" : "px-2 pb-3"}>
      <div className="space-y-1.5">
        {allowedGroups.includes("b2b") && (
          <section>
            <button type="button" aria-expanded={openGroup === "b2b"} onClick={() => toggle("b2b")}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${openGroup === "b2b" ? "bg-white/10 text-white" : "text-[#b4fcf1] hover:bg-white/5 hover:text-white"}`}>
              <Building2 className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">B2B</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${openGroup === "b2b" ? "rotate-180" : ""}`} />
            </button>
            {openGroup === "b2b" && (
              <div className="ml-3 mt-1 space-y-0.5 border-l border-white/10 pl-2">
                <LegacyButton label="Painel" view="painel" Icone={CircleGauge} active={pathname === "/" && activeLegacyView === "painel"} embedded={embedded} onLegacySelect={onLegacySelect} />
                <LegacyButton label="Minha carteira" view="carteira" Icone={Briefcase} active={pathname === "/" && activeLegacyView === "carteira"} embedded={embedded} onLegacySelect={onLegacySelect} />
                <LegacyButton label="De quem é?" view="consulta" Icone={Search} active={pathname === "/" && activeLegacyView === "consulta"} embedded={embedded} onLegacySelect={onLegacySelect} />
                {isManager && <LegacyButton label="Todas as empresas" view="empresas" Icone={Building2} active={pathname === "/" && activeLegacyView === "empresas"} embedded={embedded} onLegacySelect={onLegacySelect} />}
                <LegacyButton label="Agenda / Follow-ups" view="agenda" Icone={CalendarClock} active={pathname === "/" && activeLegacyView === "agenda"} embedded={embedded} onLegacySelect={onLegacySelect} />
                <LegacyButton label="Pipeline B2B" view="funil" Icone={GitBranch} active={pathname === "/" && activeLegacyView === "funil"} embedded={embedded} onLegacySelect={onLegacySelect} />
                <LegacyButton label="Convênios" view="convenios" Icone={Handshake} active={pathname === "/" && activeLegacyView === "convenios"} embedded={embedded} onLegacySelect={onLegacySelect} />
              </div>
            )}
          </section>
        )}

        {allowedGroups.includes("high-school") && (
          <section>
            <button type="button" aria-expanded={openGroup === "high-school"} onClick={() => toggle("high-school")}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${openGroup === "high-school" ? "bg-white/10 text-white" : "text-[#b4fcf1] hover:bg-white/5 hover:text-white"}`}>
              <GraduationCap className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">High School</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${openGroup === "high-school" ? "rotate-180" : ""}`} />
            </button>
            {openGroup === "high-school" && (
              <div className="ml-3 mt-1 space-y-0.5 border-l border-white/10 pl-2">
                <NavLink href="/high-school" label="Painel" Icone={CircleGauge} active={pathname === "/high-school"} />
                <NavLink href="/high-school/escolas" label="Escolas" Icone={School} active={pathname.startsWith("/high-school/escolas")} />
                <NavLink href="/high-school/pipeline" label="Pipeline Escolas" Icone={GitBranch} active={pathname === "/high-school/pipeline"} />
                <NavLink href="/high-school/agenda" label="Agenda de Ações" Icone={CalendarClock} active={pathname === "/high-school/agenda"} />
                {can(canonicalRole, "supervest.read") && <NavLink href="/supervest" label="SuperVestibular" Icone={GraduationCap} active={pathname.startsWith("/supervest")} />}
              </div>
            )}
          </section>
        )}

        {allowedGroups.includes("routes") && (
          <section>
            <button type="button" aria-expanded={openGroup === "routes"} onClick={() => toggle("routes")}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${openGroup === "routes" ? "bg-white/10 text-white" : "text-[#b4fcf1] hover:bg-white/5 hover:text-white"}`}>
              <Route className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">Rotas</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${openGroup === "routes" ? "rotate-180" : ""}`} />
            </button>
            {openGroup === "routes" && (
              <div className="ml-3 mt-1 space-y-0.5 border-l border-white/10 pl-2">
                {can(canonicalRole, "map.read") && <NavLink href="/mapa" label="Mapa de locais" Icone={MapPinned} active={pathname === "/mapa"} />}
                {can(canonicalRole, "routes.plan") && <NavLink href="/mapa/rotas" label="Planejar rotas" Icone={Route} active={pathname.startsWith("/mapa/rotas")} />}
              </div>
            )}
          </section>
        )}

        {allowedGroups.includes("settings") && (
          <section>
            <button type="button" aria-expanded={openGroup === "settings"} onClick={() => toggle("settings")}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${openGroup === "settings" ? "bg-white/10 text-white" : "text-[#b4fcf1] hover:bg-white/5 hover:text-white"}`}>
              <Settings className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">Configurações</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${openGroup === "settings" ? "rotate-180" : ""}`} />
            </button>
            {openGroup === "settings" && (
              <div className="ml-3 mt-1 space-y-0.5 border-l border-white/10 pl-2">
                {(can(canonicalRole, "goals.read.own") || can(canonicalRole, "goals.read.all")) && <NavLink href="/gestao/metas" label="Central de Metas" Icone={Target} active={pathname.startsWith("/gestao/metas")} />}
                {isManager && (
                  <>
                    <LegacyButton label="Equipe" view="equipe" focus="equipe" Icone={Users} active={pathname === "/" && activeLegacyView === "equipe"} embedded={embedded} onLegacySelect={onLegacySelect} />
                    <LegacyButton label="Links" view="equipe" focus="links" Icone={Link2} active={false} embedded={embedded} onLegacySelect={onLegacySelect} />
                    <NavLink href="/gestao/configuracoes" label="Integrações" Icone={SlidersHorizontal} active={pathname.startsWith("/gestao/configuracoes")} />
                  </>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

export function SystemSidebar({ role, userName }: { role?: RoleInput; userName?: string | null }) {
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  const sair = async () => {
    setSigningOut(true)
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push("/auth/login")
      router.refresh()
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <nav className="flex w-full shrink-0 flex-col bg-[#00302b] text-white md:min-h-screen md:w-64">
      <Link href="/dashboard" className="hidden border-b border-white/10 px-5 py-5 transition hover:bg-white/5 md:block">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[#b4fcf1]">UniMetrocamp Wyden</p>
        <p className="mt-1 text-base font-semibold text-white">Comercial</p>
        <p className="mt-0.5 text-[11px] text-[#b4fcf1]/60">CRM B2B · High School · Rotas</p>
      </Link>
      <div className="min-h-0 flex-1 overflow-y-auto py-2"><SystemSidebarMenu role={role} /></div>
      <div className="hidden border-t border-white/10 px-5 py-4 md:block">
        {userName && <p className="truncate text-sm font-semibold text-white">{userName}</p>}
        <p className="mt-0.5 text-[11px] text-[#b4fcf1]/60">{rotuloRole(role)}</p>
        <div className="mt-2 flex items-center gap-3 text-[11px]">
          <button type="button" disabled={signingOut} onClick={sair} className="text-[#b4fcf1] hover:underline disabled:opacity-50">{signingOut ? "saindo…" : "sair"}</button>
          <Link href="/auth/reset-password" className="text-[#b4fcf1]/65 hover:text-[#b4fcf1] hover:underline">trocar senha</Link>
        </div>
      </div>
    </nav>
  )
}
