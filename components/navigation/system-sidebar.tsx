"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import {
  Building2,
  Briefcase,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  CircleGauge,
  GraduationCap,
  KeyRound,
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
  UserRound,
} from "lucide-react"
import { can, normalizeRole, rotuloRole } from "@/lib/domain/roles"
import { createClient } from "@/lib/supabase/client"

type GroupKey = "b2b" | "high-school" | "routes" | "attendance" | "settings"
type LegacyView = "painel" | "carteira" | "consulta" | "empresas" | "agenda" | "funil" | "equipe"
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

function groupForPath(pathname: string): GroupKey {
  if (pathname.startsWith("/high-school") || pathname.startsWith("/supervest")) return "high-school"
  if (pathname.startsWith("/mapa")) return "routes"
  if (pathname.startsWith("/atendimento")) return "attendance"
  if (pathname.startsWith("/gestao") || pathname.startsWith("/auth/reset-password")) return "settings"
  return "b2b"
}

function submenuClass(active: boolean) {
  return `flex min-h-9 w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-[13px] transition ${
    active
      ? "border-white/10 bg-white/[0.11] font-semibold text-white shadow-sm"
      : "border-transparent text-[#b4fcf1]/72 hover:bg-white/[0.06] hover:text-white"
  }`
}

function LegacyButton({ label, view, focus, Icone, active, embedded, onLegacySelect }: {
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
      <button type="button" onClick={() => onLegacySelect({ view, focus })} className={submenuClass(active)} aria-current={active ? "page" : undefined}>
        <Icone className={`h-4 w-4 shrink-0 ${active ? "text-[#b4fcf1]" : "text-[#b4fcf1]/48"}`} aria-hidden />
        <span>{label}</span>
      </button>
    )
  }
  const query = new URLSearchParams({ view })
  if (focus) query.set("focus", focus)
  return (
    <Link href={`/?${query.toString()}`} className={submenuClass(active)} aria-current={active ? "page" : undefined}>
      <Icone className={`h-4 w-4 shrink-0 ${active ? "text-[#b4fcf1]" : "text-[#b4fcf1]/48"}`} aria-hidden />
      <span>{label}</span>
    </Link>
  )
}

function NavLink({ href, label, Icone, active }: { href: string; label: string; Icone: typeof Building2; active: boolean }) {
  return (
    <Link href={href} className={submenuClass(active)} aria-current={active ? "page" : undefined}>
      <Icone className={`h-4 w-4 shrink-0 ${active ? "text-[#b4fcf1]" : "text-[#b4fcf1]/48"}`} aria-hidden />
      <span>{label}</span>
    </Link>
  )
}

function GroupButton({ group, label, Icone, open, onClick }: {
  group: GroupKey
  label: string
  Icone: typeof Building2
  open: boolean
  onClick: (group: GroupKey) => void
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={() => onClick(group)}
      className={`flex min-h-11 w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
        open ? "border-white/10 bg-white/[0.09] text-white shadow-sm" : "border-transparent text-[#b4fcf1] hover:bg-white/[0.06] hover:text-white"
      }`}
    >
      <Icone className={`h-4 w-4 shrink-0 ${open ? "text-[#b4fcf1]" : "text-[#b4fcf1]/62"}`} aria-hidden />
      <span className="flex-1 text-left">{label}</span>
      <ChevronDown className={`h-4 w-4 text-[#b4fcf1]/45 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
    </button>
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
    if (can(canonicalRole, "attendance.read")) result.push("attendance")
    if (can(canonicalRole, "goals.read.own") || can(canonicalRole, "goals.read.all") || can(canonicalRole, "team.manage") || can(canonicalRole, "settings.write")) result.push("settings")
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
    <div className={embedded ? "px-2 py-2" : "px-2.5 pb-3"}>
      <div className="space-y-1.5">
        {allowedGroups.includes("b2b") && (
          <section>
            <GroupButton group="b2b" label="B2B" Icone={Building2} open={openGroup === "b2b"} onClick={toggle} />
            {openGroup === "b2b" && (
              <div className="ml-3 mt-1 space-y-0.5 border-l border-white/10 pl-2">
                <LegacyButton label="Painel" view="painel" Icone={CircleGauge} active={pathname === "/" && activeLegacyView === "painel"} embedded={embedded} onLegacySelect={onLegacySelect} />
                <LegacyButton label="Minha carteira" view="carteira" Icone={Briefcase} active={pathname === "/" && activeLegacyView === "carteira"} embedded={embedded} onLegacySelect={onLegacySelect} />
                <LegacyButton label="De quem é?" view="consulta" Icone={Search} active={pathname === "/" && activeLegacyView === "consulta"} embedded={embedded} onLegacySelect={onLegacySelect} />
                {isManager && <LegacyButton label="Todas as empresas" view="empresas" Icone={Building2} active={pathname === "/" && activeLegacyView === "empresas"} embedded={embedded} onLegacySelect={onLegacySelect} />}
                <LegacyButton label="Agenda / Follow-ups" view="agenda" Icone={CalendarClock} active={pathname === "/" && activeLegacyView === "agenda"} embedded={embedded} onLegacySelect={onLegacySelect} />
                <LegacyButton label="Pipeline B2B" view="funil" Icone={GitBranch} active={pathname === "/" && activeLegacyView === "funil"} embedded={embedded} onLegacySelect={onLegacySelect} />
              </div>
            )}
          </section>
        )}

        {allowedGroups.includes("high-school") && (
          <section>
            <GroupButton group="high-school" label="High School" Icone={GraduationCap} open={openGroup === "high-school"} onClick={toggle} />
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
            <GroupButton group="routes" label="Rotas" Icone={Route} open={openGroup === "routes"} onClick={toggle} />
            {openGroup === "routes" && (
              <div className="ml-3 mt-1 space-y-0.5 border-l border-white/10 pl-2">
                {can(canonicalRole, "map.read") && <NavLink href="/mapa" label="Mapa de locais" Icone={MapPinned} active={pathname === "/mapa"} />}
                {can(canonicalRole, "routes.plan") && <NavLink href="/mapa/rotas" label="Planejar rotas" Icone={Route} active={pathname.startsWith("/mapa/rotas")} />}
              </div>
            )}
          </section>
        )}

        {allowedGroups.includes("attendance") && (
          <section>
            <GroupButton group="attendance" label="Atendimento" Icone={CalendarDays} open={openGroup === "attendance"} onClick={toggle} />
            {openGroup === "attendance" && (
              <div className="ml-3 mt-1 space-y-0.5 border-l border-white/10 pl-2">
                <NavLink href="/atendimento" label={isManager ? "Escala" : "Programação"} Icone={CalendarDays} active={pathname === "/atendimento"} />
                <NavLink href="/atendimento/minha-agenda" label="Minha agenda" Icone={UserRound} active={pathname.startsWith("/atendimento/minha-agenda")} />
              </div>
            )}
          </section>
        )}

        {allowedGroups.includes("settings") && (
          <section>
            <GroupButton group="settings" label="Configurações" Icone={Settings} open={openGroup === "settings"} onClick={toggle} />
            {openGroup === "settings" && (
              <div className="ml-3 mt-1 space-y-0.5 border-l border-white/10 pl-2">
                <NavLink href="/auth/reset-password" label="Alterar minha senha" Icone={KeyRound} active={pathname === "/auth/reset-password"} />
                {(can(canonicalRole, "goals.read.own") || can(canonicalRole, "goals.read.all")) && <NavLink href="/gestao/metas" label="Central de Metas" Icone={Target} active={pathname.startsWith("/gestao/metas")} />}
                {isManager && (
                  <>
                    <LegacyButton label="Gestão de usuários" view="equipe" focus="equipe" Icone={Users} active={pathname === "/" && activeLegacyView === "equipe"} embedded={embedded} onLegacySelect={onLegacySelect} />
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
    } finally { setSigningOut(false) }
  }

  return (
    <nav className="flex w-full shrink-0 flex-col bg-[linear-gradient(180deg,#00302b_0%,#00251f_100%)] text-white md:min-h-screen md:w-64 md:shadow-[8px_0_30px_rgba(0,48,43,0.10)]">
      <Link href="/dashboard" className="border-b border-white/10 px-4 py-5 transition hover:bg-white/[0.04] md:px-5 md:py-6">
        <p className="text-2xl font-bold tracking-[-0.035em] text-white">UniConecta</p>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#b4fcf1]/62">Gestão comercial integrada</p>
        <div className="mt-3 h-1 w-8 rounded-full bg-[#b4fcf1]/75" aria-hidden />
      </Link>
      <div className="min-h-0 flex-1 overflow-y-auto py-2.5"><SystemSidebarMenu role={role} /></div>
      <div className="border-t border-white/10 px-4 py-3.5 md:px-5 md:py-4">
        {userName && <p className="truncate text-sm font-semibold text-white">{userName}</p>}
        <p className="mt-0.5 text-[11px] text-[#b4fcf1]/55">{rotuloRole(role)}</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          <button type="button" disabled={signingOut} onClick={sair} className="rounded font-medium text-[#b4fcf1] underline-offset-4 hover:text-white hover:underline disabled:opacity-50">{signingOut ? "saindo…" : "sair"}</button>
          <span className="h-3 w-px bg-white/15" aria-hidden />
          <Link href="/auth/reset-password" className="rounded text-[#b4fcf1]/65 underline-offset-4 hover:text-white hover:underline">trocar senha</Link>
        </div>
      </div>
    </nav>
  )
}
