import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft, Route } from "lucide-react"
import { getActor } from "@/lib/auth/guards"
import { can } from "@/lib/domain/roles"
import { opcoesFiltroMapa } from "@/lib/data/map-queries"
import { MapView } from "@/components/maps/map-view"

export const dynamic = "force-dynamic"

// Centro padrão: Região Metropolitana de Campinas.
const CENTRO_RMC = { longitude: -47.0626, latitude: -22.9099, zoom: 10.5 }

export default async function MapaPage() {
  const actor = await getActor()
  if (!actor) redirect("/auth/login")
  if (!can(actor.role, "map.read")) redirect("/")

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const opcoes = await opcoesFiltroMapa()

  return (
    <div className="flex h-screen flex-col bg-background font-sans text-foreground">
      <header className="flex items-center gap-3 border-b border-border bg-[#00302b] px-4 py-2.5 text-[#b4fcf1]">
        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-[#b4fcf1]/80 transition hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <h1 className="text-sm font-semibold text-white">Mapa Comercial</h1>
        <span className="ml-auto hidden text-xs text-[#b4fcf1]/60 sm:inline">Empresas & Escolas · RMC</span>
        {can(actor.role, "routes.plan") && (
          <Link
            href="/mapa/rotas"
            className="ml-auto flex items-center gap-1.5 rounded-md bg-[#88005b] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#a30d70] sm:ml-3"
          >
            <Route className="h-4 w-4" />
            Planejar rota
          </Link>
        )}
      </header>

      <div className="relative flex-1">
        {token ? (
          <MapView token={token} opcoes={opcoes} centroInicial={CENTRO_RMC} />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center">
            <div className="max-w-md">
              <h2 className="mb-2 text-lg font-semibold">Mapa indisponível</h2>
              <p className="text-sm text-muted-foreground">
                A variável <code className="rounded bg-muted px-1">NEXT_PUBLIC_MAPBOX_TOKEN</code> não está
                configurada. Adicione o token público do Mapbox nas variáveis de ambiente do projeto para
                habilitar o mapa.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
