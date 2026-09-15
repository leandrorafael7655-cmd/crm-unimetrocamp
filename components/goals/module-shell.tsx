"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowLeft, Target, GraduationCap } from "lucide-react"

const ITENS = [
  { href: "/gestao/metas", rotulo: "Central de Metas", Icone: Target },
  { href: "/supervest", rotulo: "SuperVestibular", Icone: GraduationCap },
]

/** Chrome compartilhado das telas de gestão com a identidade UniConecta. */
export function ModuleShell({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string
  subtitulo: string
  children: ReactNode
}) {
  const pathname = usePathname()
  const ativo = (href: string) => pathname === href || pathname.startsWith(href + "/")

  return (
    <div className="min-h-screen bg-[#faf7f9] font-sans text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col md:flex-row">
        <nav className="shrink-0 bg-brand-rail md:w-56">
          <div className="hidden px-5 py-5 md:block">
            <p className="text-sm font-semibold text-white">{titulo}</p>
            <p className="text-[11px] text-white/55">{subtitulo}</p>
          </div>
          <ul className="flex overflow-x-auto md:block md:px-2">
            {ITENS.map(({ href, rotulo, Icone }) => (
              <li key={href} className="shrink-0">
                <Link
                  href={href}
                  className={`flex w-full items-center gap-2 whitespace-nowrap px-4 py-3 text-sm transition md:rounded-lg md:py-2 ${
                    ativo(href)
                      ? "bg-white/10 font-medium text-white"
                      : "text-white/68 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Icone className={`h-4 w-4 shrink-0 ${ativo(href) ? "text-[#ff8a52]" : ""}`} />
                  {rotulo}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-1 border-t border-white/10 px-2 py-2">
            <Link
              href="/dashboard"
              className="flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-4 py-3 text-sm text-white/68 transition hover:bg-white/5 hover:text-white md:py-2"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              Voltar ao UniConecta
            </Link>
          </div>
        </nav>
        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}
