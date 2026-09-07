import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { Lock } from "lucide-react"
import { getActor } from "@/lib/auth/guards"
import { can, rotuloRole } from "@/lib/domain/roles"
import { HsNav, type HsNavExtra } from "@/components/high-school/hs-nav"

export const dynamic = "force-dynamic"

export default async function HighSchoolLayout({ children }: { children: ReactNode }) {
  const actor = await getActor()
  if (!actor) redirect("/auth/login")
  if (!actor.active) redirect("/auth/login?erro=inativo")
  // Qualquer papel com hs.read acessa; sem isso, volta ao CRM.
  if (!can(actor.role, "hs.read")) redirect("/")

  const podeEscrever = can(actor.role, "hs.write")

  const extraItens: HsNavExtra[] = []
  extraItens.push({ href: "/dashboard", rotulo: "Painel Geral", icone: "Gauge" })
  if (can(actor.role, "map.read")) {
    extraItens.push({ href: "/mapa", rotulo: "Mapa", icone: "Map" })
  }
  if (can(actor.role, "routes.plan")) {
    extraItens.push({ href: "/mapa/rotas", rotulo: "Rotas", icone: "Route" })
  }
  if (can(actor.role, "supervest.read")) {
    extraItens.push({ href: "/supervest", rotulo: "SuperVestibular", icone: "GraduationCap" })
  }
  if (can(actor.role, "goals.read.all")) {
    extraItens.push({ href: "/gestao/metas", rotulo: "Central de Metas", icone: "Target" })
  }

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col md:flex-row">
        <HsNav extraItens={extraItens} />
        <main className="min-w-0 flex-1 p-4 sm:p-6">
          {!podeEscrever && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
              <Lock className="h-4 w-4 shrink-0" />
              <span>
                Você está no modo somente leitura ({rotuloRole(actor.role)}). A edição de escolas e ações é restrita à
                equipe High School e à gestão.
              </span>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  )
}
