import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft, Map as MapIcon } from "lucide-react"
import { getActor } from "@/lib/auth/guards"
import { can } from "@/lib/domain/roles"
import { pontosDisponiveis, listarPlanos } from "@/lib/data/route-queries"
import { RoutePlanner } from "@/components/routes/route-planner"

export const dynamic = "force-dynamic"

export default async function RotasPage() {
  const actor = await getActor()
  if (!actor) redirect("/auth/login")
  if (!can(actor.role, "routes.plan")) redirect("/")

  const [pontos, planos] = await Promise.all([pontosDisponiveis(), listarPlanos(20)])

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      <header className="flex items-center gap-3 border-b border-border bg-[#00302b] px-4 py-2.5 text-[#b4fcf1]">
        <Link
          href="/mapa"
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-[#b4fcf1]/80 transition hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Mapa
        </Link>
        <div className="flex items-center gap-2">
          <MapIcon className="h-4 w-4" />
          <h1 className="text-sm font-semibold text-white">Planejador de Rotas</h1>
        </div>
        <span className="ml-auto text-xs text-[#b4fcf1]/60">Otimização Mapbox · RMC</span>
      </header>

      <main className="flex-1">
        <RoutePlanner pontos={pontos} planosRecentes={planos} />
      </main>
    </div>
  )
}
