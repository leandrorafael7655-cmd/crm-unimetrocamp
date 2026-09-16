import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { Lock } from "lucide-react"
import { getActor } from "@/lib/auth/guards"
import { can, rotuloRole } from "@/lib/domain/roles"
import { SystemSidebar } from "@/components/navigation/system-sidebar"

export const dynamic = "force-dynamic"

export default async function HighSchoolLayout({ children }: { children: ReactNode }) {
  const actor = await getActor()
  if (!actor) redirect("/auth/login")
  if (!actor.active) redirect("/auth/login?erro=inativo")
  if (!can(actor.role, "hs.read")) redirect("/")

  const podeEscrever = can(actor.role, "hs.write")

  return (
    <div className="min-h-screen bg-[#faf7f9] font-sans text-slate-900 md:flex">
      <SystemSidebar role={actor.role} userName={actor.display_name} />
      <main className="min-w-0 flex-1 p-4 sm:p-6">
        {!podeEscrever && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 shadow-sm">
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
  )
}
