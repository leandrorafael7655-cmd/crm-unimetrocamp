"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, School, GitBranch, CalendarClock, ArrowLeft, GraduationCap, Target, Map, Route, Gauge } from "lucide-react"

const ITENS = [
  { href: "/high-school", rotulo: "Dashboard", Icone: LayoutDashboard, exato: true },
  { href: "/high-school/escolas", rotulo: "Escolas", Icone: School, exato: false },
  { href: "/high-school/pipeline", rotulo: "Pipeline", Icone: GitBranch, exato: true },
  { href: "/high-school/agenda", rotulo: "Agenda", Icone: CalendarClock, exato: true },
]

const ICONES_EXTRA = { GraduationCap, Target, Map, Route, Gauge } as const

export interface HsNavExtra {
  href: string
  rotulo: string
  icone: keyof typeof ICONES_EXTRA
}

export function HsNav({ extraItens = [] }: { extraItens?: HsNavExtra[] }) {
  const pathname = usePathname()
  const ativo = (href: string, exato: boolean) =>
    exato ? pathname === href : pathname === href || pathname.startsWith(href + "/")

  return (
    <nav className="shrink-0 bg-brand-rail md:w-56">
      <div className="hidden px-5 py-5 md:block">
        <p className="text-sm font-semibold text-brand-suave">High School</p>
        <p className="text-[11px] text-brand-suave/60">Relacionamento com escolas</p>
      </div>
      <ul className="flex overflow-x-auto md:block md:px-2">
        {ITENS.map(({ href, rotulo, Icone, exato }) => (
          <li key={href} className="shrink-0">
            <Link
              href={href}
              className={`flex w-full items-center gap-2 whitespace-nowrap px-4 py-3 text-sm transition md:rounded md:py-2 ${
                ativo(href, exato)
                  ? "bg-white/10 font-medium text-white"
                  : "text-brand-suave/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icone className="h-4 w-4 shrink-0" />
              {rotulo}
            </Link>
          </li>
        ))}
      </ul>
      {extraItens.length > 0 && (
        <ul className="mt-1 flex overflow-x-auto border-t border-white/10 md:block md:px-2 md:pt-1">
          {extraItens.map(({ href, rotulo, icone }) => {
            const Icone = ICONES_EXTRA[icone]
            return (
              <li key={href} className="shrink-0">
                <Link
                  href={href}
                  className={`flex w-full items-center gap-2 whitespace-nowrap px-4 py-3 text-sm transition md:rounded md:py-2 ${
                    ativo(href, false)
                      ? "bg-white/10 font-medium text-white"
                      : "text-brand-suave/70 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Icone className="h-4 w-4 shrink-0" />
                  {rotulo}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      <div className="mt-1 border-t border-white/10 px-2 py-2">
        <Link
          href="/"
          className="flex w-full items-center gap-2 whitespace-nowrap rounded px-4 py-3 text-sm text-brand-suave/70 transition hover:bg-white/5 hover:text-white md:py-2"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          Voltar ao CRM B2B
        </Link>
      </div>
    </nav>
  )
}
