import Link from "next/link"
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Database,
  KeyRound,
  MapPinned,
  Route,
  Settings,
  ShieldCheck,
  Target,
} from "lucide-react"
import { requireManager } from "@/lib/auth/guards"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

type StatusItem = {
  label: string
  ok: boolean
  detail: string
}

function ConfigStatus({ item }: { item: StatusItem }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <p className="text-sm font-semibold text-slate-800">{item.label}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{item.detail}</p>
      </div>
      <span
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
          item.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
        }`}
      >
        {item.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
        {item.ok ? "Configurado" : "Ausente"}
      </span>
    </div>
  )
}

function Kpi({ label, value, detail }: { label: string; value: number | string; detail?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
    </div>
  )
}

export default async function ConfiguracoesPage() {
  const actor = await requireManager()
  const supabase = await createClient()

  const [companiesR, schoolsR, routesR, goalsR, supervestR, snapshotsR] = await Promise.all([
    supabase.from("companies").select("id,latitude,longitude"),
    supabase.from("schools").select("id,latitude,longitude"),
    supabase.from("route_plans").select("id", { count: "exact", head: true }),
    supabase.from("goals").select("id", { count: "exact", head: true }).eq("status", "ativa"),
    supabase
      .from("supervest_cycles")
      .select("id,name,status,event_at,registrations_target")
      .neq("status", "encerrado")
      .neq("status", "cancelado")
      .order("event_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase.from("weekly_action_snapshots").select("id", { count: "exact", head: true }),
  ])

  const companies = companiesR.data ?? []
  const schools = schoolsR.data ?? []
  const companiesGeo = companies.filter((c) => c.latitude != null && c.longitude != null).length
  const schoolsGeo = schools.filter((s) => s.latitude != null && s.longitude != null).length
  const supervest = supervestR.data

  const config: StatusItem[] = [
    {
      label: "Supabase · URL pública",
      ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      detail: "Conexão principal do CRM com o banco e Auth.",
    },
    {
      label: "Supabase · chave pública",
      ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      detail: "Chave pública usada pelos clientes SSR/browser sob RLS.",
    },
    {
      label: "Supabase · chave de serviço",
      ok: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      detail: "Usada somente em rotinas administrativas server-side que precisem ignorar RLS.",
    },
    {
      label: "Mapbox · token público",
      ok: Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN),
      detail: "Necessário para renderizar o mapa no navegador.",
    },
    {
      label: "Mapbox · token server",
      ok: Boolean(process.env.MAPBOX_SECRET_TOKEN),
      detail: "Usado para geocoding e otimização de rotas no servidor; há fallback para o token público.",
    },
    {
      label: "Vercel Cron",
      ok: Boolean(process.env.CRON_SECRET),
      detail: "Protege o fechamento automático da aderência semanal B2B.",
    },
    {
      label: "URL pública do CRM",
      ok: Boolean(process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL),
      detail: "Usada para redirects de autenticação e links absolutos.",
    },
  ]

  const essenciaisOk = config.filter((i) => !i.label.includes("chave de serviço")).every((i) => i.ok)

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900">
      <header className="bg-[#00302b] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-[#b4fcf1]/80 transition hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-[#b4fcf1]" />
                <h1 className="text-lg font-semibold">Configurações</h1>
              </div>
              <p className="mt-0.5 text-xs text-[#b4fcf1]/65">Saúde do ambiente e integrações do CRM</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium">{actor.full_name}</p>
            <p className="text-xs text-[#b4fcf1]/65">Acesso de gestão</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <section
          className={`flex items-start gap-3 rounded-xl border p-4 ${
            essenciaisOk ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
          }`}
        >
          {essenciaisOk ? (
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          ) : (
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          )}
          <div>
            <p className={`text-sm font-semibold ${essenciaisOk ? "text-emerald-800" : "text-amber-800"}`}>
              {essenciaisOk ? "Ambiente essencial configurado" : "Há configuração essencial pendente"}
            </p>
            <p className={`mt-1 text-xs leading-5 ${essenciaisOk ? "text-emerald-700" : "text-amber-700"}`}>
              Este painel mostra somente presença/ausência das variáveis. Nenhum token, chave ou segredo é exibido.
            </p>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-[#88005b]" />
            <h2 className="text-sm font-semibold text-slate-800">Integrações</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {config.map((item) => (
              <ConfigStatus key={item.label} item={item} />
            ))}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2">
            <Database className="h-4 w-4 text-[#88005b]" />
            <h2 className="text-sm font-semibold text-slate-800">Saúde dos dados</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Empresas" value={companies.length} detail={`${companiesGeo} geolocalizadas`} />
            <Kpi label="Escolas" value={schools.length} detail={`${schoolsGeo} geolocalizadas`} />
            <Kpi label="Rotas salvas" value={routesR.count ?? 0} />
            <Kpi label="Metas ativas" value={goalsR.count ?? 0} />
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-[#88005b]" />
              <h2 className="text-sm font-semibold">SuperVestibular</h2>
            </div>
            {supervest ? (
              <div className="mt-4 space-y-2 text-sm">
                <p className="font-semibold text-slate-800">{supervest.name}</p>
                <div className="grid grid-cols-2 gap-3 text-xs text-slate-500">
                  <div>
                    <span className="block">Meta de inscrições</span>
                    <strong className="text-base text-slate-800">{supervest.registrations_target ?? 0}</strong>
                  </div>
                  <div>
                    <span className="block">Evento</span>
                    <strong className="text-sm text-slate-800">
                      {supervest.event_at
                        ? new Date(supervest.event_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
                        : "—"}
                    </strong>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">Nenhum ciclo ativo encontrado.</p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <Route className="h-4 w-4 text-[#88005b]" />
              <h2 className="text-sm font-semibold">Execução de campo</h2>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Snapshots semanais</p>
                <p className="mt-1 text-xl font-bold tabular-nums">{snapshotsR.count ?? 0}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Cobertura geográfica</p>
                <p className="mt-1 text-xl font-bold tabular-nums">
                  {companies.length + schools.length === 0
                    ? "0%"
                    : `${Math.round(((companiesGeo + schoolsGeo) / (companies.length + schools.length)) * 100)}%`}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/gestao/metas"
                className="rounded-md bg-[#88005b] px-3 py-2 text-xs font-semibold text-white hover:bg-[#6d0049]"
              >
                Abrir Metas
              </Link>
              <Link
                href="/mapa"
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <MapPinned className="h-3.5 w-3.5" />
                Abrir Mapa
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
