"use client"

import { useMemo, useState, useTransition } from "react"
import {
  Search, Plus, X, ArrowUp, ArrowDown, Route, Save, Navigation, MapPin,
  Clock, Building2, GraduationCap, Sparkles, LocateFixed, AlertTriangle, CheckCircle2,
} from "lucide-react"
import {
  otimizarRotaAction, salvarPlanoAction,
  type ParadaPayload,
} from "@/app/actions/routes"
import { sugerirProximidadeAction } from "@/app/actions/routes"

/* ── tipos locais (evita importar módulos server-only no cliente) ── */
type Tipo = "company" | "school"
interface Ponto {
  id: string
  tipo: Tipo
  nome: string
  cidade: string | null
  bairro: string | null
  lat: number
  lng: number
  etapa: string | null
  classificacao: string | null
  dono: string | null
}
interface PlanoResumo {
  id: string
  plan_date: string
  status: string
  total_distance_m: number | null
  total_duration_s: number | null
}
interface Sugestao {
  id: string
  tipo: Tipo
  nome: string
  cidade: string | null
  lat: number
  lng: number
  distanciaKm: number
  motivo: string
}
interface Selecionada {
  ponto: Ponto
  fixed_time: string
  visit_minutes: string
  eta?: string
}

const BASE = { lng: -47.0626, lat: -22.9099, label: "Base (RMC)" }
const LIMITE_PARADAS = 10 // origem + destino + 10 = 12 coords (limite Mapbox v1)

function fmtDur(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`
}
function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`
}

export function RoutePlanner({
  pontos,
  planosRecentes,
}: {
  pontos: Ponto[]
  planosRecentes: PlanoResumo[]
}) {
  const [planDate, setPlanDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [origem, setOrigem] = useState({ ...BASE })
  const [destino, setDestino] = useState({ ...BASE })
  const [terminarNaBase, setTerminarNaBase] = useState(true)
  const [departure, setDeparture] = useState("08:00")
  const [returnTime, setReturnTime] = useState("")
  const [avgVisit, setAvgVisit] = useState("45")
  const [busca, setBusca] = useState("")
  const [selecionadas, setSelecionadas] = useState<Selecionada[]>([])
  const [otimizado, setOtimizado] = useState(false)
  const [totais, setTotais] = useState<{ dist: number; dur: number } | null>(null)
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok" | "limite"; texto: string } | null>(null)
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([])
  const [planoId, setPlanoId] = useState<string | null>(null)
  const [otimizando, iniciarOtimizacao] = useTransition()
  const [salvando, iniciarSalvar] = useTransition()
  const [sugerindo, iniciarSugestao] = useTransition()

  const idsSelecionados = useMemo(() => new Set(selecionadas.map((s) => s.ponto.id)), [selecionadas])

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const base = pontos.filter((p) => !idsSelecionados.has(p.id))
    if (!t) return base.slice(0, 40)
    return base.filter((p) => p.nome.toLowerCase().includes(t) || (p.cidade ?? "").toLowerCase().includes(t)).slice(0, 40)
  }, [pontos, busca, idsSelecionados])

  function adicionar(p: Ponto) {
    if (idsSelecionados.has(p.id)) return
    setSelecionadas((prev) => [...prev, { ponto: p, fixed_time: "", visit_minutes: "" }])
    resetarResultado()
  }
  function remover(id: string) {
    setSelecionadas((prev) => prev.filter((s) => s.ponto.id !== id))
    resetarResultado()
  }
  function mover(idx: number, dir: -1 | 1) {
    setSelecionadas((prev) => {
      const arr = [...prev]
      const j = idx + dir
      if (j < 0 || j >= arr.length) return prev
      ;[arr[idx], arr[j]] = [arr[j], arr[idx]]
      return arr
    })
    setOtimizado(false)
    setAviso({ tipo: "erro", texto: "Ordem alterada manualmente — saiu da rota otimizada. Otimize novamente se quiser." })
  }
  function atualizar(id: string, campo: "fixed_time" | "visit_minutes", valor: string) {
    setSelecionadas((prev) => prev.map((s) => (s.ponto.id === id ? { ...s, [campo]: valor } : s)))
  }
  function resetarResultado() {
    setOtimizado(false)
    setTotais(null)
    setAviso(null)
  }

  function usarMinhaLocalizacao() {
    if (!navigator.geolocation) {
      setAviso({ tipo: "erro", texto: "Geolocalização indisponível neste navegador." })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigem({ lng: pos.coords.longitude, lat: pos.coords.latitude, label: "Minha localização" })
        setAviso({ tipo: "ok", texto: "Origem definida pela sua localização atual." })
      },
      () => setAviso({ tipo: "erro", texto: "Não foi possível obter sua localização (permissão negada?)." }),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  function montarParadas(): ParadaPayload[] {
    return selecionadas.map((s) => ({
      entity_type: s.ponto.tipo,
      entity_id: s.ponto.id,
      lat: s.ponto.lat,
      lng: s.ponto.lng,
      fixed_time: s.fixed_time || null,
      visit_minutes: s.visit_minutes ? Number(s.visit_minutes) : null,
    }))
  }

  function otimizar() {
    if (selecionadas.length === 0) {
      setAviso({ tipo: "erro", texto: "Adicione pelo menos uma parada." })
      return
    }
    if (selecionadas.length > LIMITE_PARADAS) {
      setAviso({
        tipo: "limite",
        texto: `Você tem ${selecionadas.length} paradas. O limite por rota é ${LIMITE_PARADAS} (origem + destino + ${LIMITE_PARADAS}). Divida em dois dias ou remova paradas.`,
      })
      return
    }
    const destinoFinal = terminarNaBase ? { ...BASE } : destino
    iniciarOtimizacao(async () => {
      const r = await otimizarRotaAction({
        origem: { lat: origem.lat, lng: origem.lng },
        destino: { lat: destinoFinal.lat, lng: destinoFinal.lng },
        paradas: montarParadas(),
        avgVisitMinutes: Number(avgVisit) || 45,
        departureTime: departure || null,
      })
      if (r.excedeuLimite) {
        setAviso({ tipo: "limite", texto: r.erro ?? "Limite de coordenadas excedido." })
        return
      }
      if (!r.ok || r.erro) {
        setAviso({ tipo: "erro", texto: r.erro ?? "Falha ao otimizar." })
        // preserva ordem manual; não marca como otimizado
      }
      // reordena conforme resultado
      const ordemIndex = new Map(r.ordem.map((id, i) => [id, i]))
      setSelecionadas((prev) =>
        [...prev]
          .sort((a, b) => (ordemIndex.get(a.ponto.id) ?? 999) - (ordemIndex.get(b.ponto.id) ?? 999))
          .map((s) => ({ ...s, eta: r.etaPorParada[s.ponto.id] })),
      )
      setTotais({ dist: r.totalDistanceM, dur: r.totalDurationS })
      setOtimizado(r.otimizado)
      if (r.otimizado && !r.erro) {
        setAviso({ tipo: "ok", texto: "Rota otimizada pela Mapbox. Sequência e horários recalculados." })
      }
    })
  }

  function salvar() {
    if (selecionadas.length === 0) {
      setAviso({ tipo: "erro", texto: "Nada para salvar." })
      return
    }
    const destinoFinal = terminarNaBase ? { ...BASE } : destino
    iniciarSalvar(async () => {
      const r = await salvarPlanoAction({
        id: planoId,
        plan_date: planDate,
        origin_label: origem.label,
        origin_lat: origem.lat,
        origin_lng: origem.lng,
        destination_label: destinoFinal.label,
        destination_lat: destinoFinal.lat,
        destination_lng: destinoFinal.lng,
        departure_time: departure || null,
        return_time: returnTime || null,
        avg_visit_minutes: Number(avgVisit) || 45,
        optimized: otimizado,
        total_distance_m: totais?.dist ?? null,
        total_duration_s: totais?.dur ?? null,
        stops: selecionadas.map((s, i) => ({
          entity_type: s.ponto.tipo,
          entity_id: s.ponto.id,
          sort_order: i,
          fixed_time: s.fixed_time || null,
          estimated_arrival: s.eta || null,
          visit_minutes: s.visit_minutes ? Number(s.visit_minutes) : null,
        })),
      })
      if (r.ok) {
        setPlanoId(r.id ?? null)
        setAviso({ tipo: "ok", texto: "Plano salvo." })
      } else {
        setAviso({ tipo: "erro", texto: r.message ?? "Erro ao salvar." })
      }
    })
  }

  function sugerir() {
    const ancoras = [
      { lat: origem.lat, lng: origem.lng },
      ...selecionadas.map((s) => ({ lat: s.ponto.lat, lng: s.ponto.lng })),
    ]
    iniciarSugestao(async () => {
      const r = await sugerirProximidadeAction({
        ancoras,
        excluirIds: selecionadas.map((s) => s.ponto.id),
        raioKm: 5,
      })
      setSugestoes(r)
      if (r.length === 0) setAviso({ tipo: "erro", texto: "Nenhuma sugestão num raio de 5 km das paradas atuais." })
    })
  }

  function adicionarSugestao(s: Sugestao) {
    const p = pontos.find((x) => x.id === s.id)
    if (p) adicionar(p)
    setSugestoes((prev) => prev.filter((x) => x.id !== s.id))
  }

  function urlGoogleMaps(): string {
    const destinoFinal = terminarNaBase ? { ...BASE } : destino
    const wp = selecionadas.map((s) => `${s.ponto.lat},${s.ponto.lng}`).join("|")
    const u = new URL("https://www.google.com/maps/dir/")
    u.searchParams.set("api", "1")
    u.searchParams.set("origin", `${origem.lat},${origem.lng}`)
    u.searchParams.set("destination", `${destinoFinal.lat},${destinoFinal.lng}`)
    if (wp) u.searchParams.set("waypoints", wp)
    u.searchParams.set("travelmode", "driving")
    return u.toString()
  }
  function abrirNavegacao() {
    const url = urlGoogleMaps()
    if (typeof window !== "undefined") {
      if (window.self !== window.top) window.open(url, "_blank", "noopener")
      else window.location.href = url
    }
  }

  const excedeu = selecionadas.length > LIMITE_PARADAS

  return (
    <div className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[1fr_1.2fr]">
      {/* ─── coluna esquerda: parâmetros + seleção ─── */}
      <section className="flex flex-col gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Parâmetros do dia</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Data</span>
              <input type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1.5" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Tempo médio de visita (min)</span>
              <input type="number" min={0} value={avgVisit} onChange={(e) => setAvgVisit(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1.5" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Saída</span>
              <input type="time" value={departure} onChange={(e) => setDeparture(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1.5" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Retorno (opcional)</span>
              <input type="time" value={returnTime} onChange={(e) => setReturnTime(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1.5" />
            </label>
          </div>
          <div className="mt-3 flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Origem: <strong className="text-foreground">{origem.label}</strong></span>
              <button onClick={usarMinhaLocalizacao}
                className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs transition hover:bg-muted">
                <LocateFixed className="h-3.5 w-3.5" /> Minha localização
              </button>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={terminarNaBase} onChange={(e) => setTerminarNaBase(e.target.checked)} />
              Terminar na base (RMC)
            </label>
          </div>
        </div>

        {/* busca de pontos */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Adicionar paradas</h2>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar empresa ou escola…"
              className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-2 text-sm" />
          </div>
          <ul className="flex max-h-64 flex-col gap-1 overflow-auto">
            {filtrados.length === 0 && <li className="px-1 py-2 text-xs text-muted-foreground">Nenhum ponto geocodificado encontrado.</li>}
            {filtrados.map((p) => (
              <li key={`${p.tipo}-${p.id}`}>
                <button onClick={() => adicionar(p)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-muted">
                  {p.tipo === "company"
                    ? <Building2 className="h-4 w-4 shrink-0 text-[#88005b]" />
                    : <GraduationCap className="h-4 w-4 shrink-0 text-[#00302b] dark:text-[#b4fcf1]" />}
                  <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{p.cidade ?? ""}</span>
                  <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* sugestão de proximidade */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-[#88005b]" /> Rota inteligente
            </h2>
            <button onClick={sugerir} disabled={sugerindo || selecionadas.length === 0}
              className="rounded-md border border-border px-2 py-1 text-xs transition hover:bg-muted disabled:opacity-50">
              {sugerindo ? "Buscando…" : "Sugerir próximos (5 km)"}
            </button>
          </div>
          {selecionadas.length === 0 && <p className="text-xs text-muted-foreground">Adicione paradas para receber sugestões de proximidade.</p>}
          <ul className="flex flex-col gap-1.5">
            {sugestoes.map((s) => (
              <li key={s.id} className="flex items-start gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm">
                {s.tipo === "company"
                  ? <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-[#88005b]" />
                  : <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-[#00302b] dark:text-[#b4fcf1]" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.nome}</p>
                  <p className="text-xs text-muted-foreground">{s.motivo}</p>
                </div>
                <button onClick={() => adicionarSugestao(s)} className="shrink-0 rounded-md p-1 transition hover:bg-muted" aria-label={`Adicionar ${s.nome}`}>
                  <Plus className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ─── coluna direita: rota ─── */}
      <section className="flex flex-col gap-4">
        {aviso && (
          <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
            aviso.tipo === "ok" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : aviso.tipo === "limite" ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"}`}>
            {aviso.tipo === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{aviso.texto}</span>
          </div>
        )}

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">Rota ({selecionadas.length})</h2>
            {otimizado && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-3 w-3" /> Otimizada
              </span>
            )}
            {totais && (
              <span className="ml-auto text-xs text-muted-foreground">
                {fmtDist(totais.dist)} · {fmtDur(totais.dur)}
              </span>
            )}
          </div>

          {/* origem */}
          <div className="mb-1 flex items-center gap-2 rounded-md bg-[#00302b]/5 px-2 py-1.5 text-sm dark:bg-white/5">
            <MapPin className="h-4 w-4 text-[#00302b] dark:text-[#b4fcf1]" />
            <span className="font-medium">Origem</span>
            <span className="text-muted-foreground">{origem.label} · {departure}</span>
          </div>

          <ol className="flex flex-col gap-1.5">
            {selecionadas.length === 0 && (
              <li className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                Nenhuma parada. Adicione empresas e escolas à esquerda.
              </li>
            )}
            {selecionadas.map((s, i) => (
              <li key={`${s.ponto.tipo}-${s.ponto.id}`}
                className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#88005b] text-xs font-bold text-white">{i + 1}</span>
                {s.ponto.tipo === "company"
                  ? <Building2 className="h-4 w-4 shrink-0 text-[#88005b]" />
                  : <GraduationCap className="h-4 w-4 shrink-0 text-[#00302b] dark:text-[#b4fcf1]" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.ponto.nome}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {s.eta && <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {s.eta}</span>}
                    <label className="flex items-center gap-1">
                      Hora fixa:
                      <input type="time" value={s.fixed_time} onChange={(e) => atualizar(s.ponto.id, "fixed_time", e.target.value)}
                        className="rounded border border-border bg-background px-1 py-0.5 text-xs" />
                    </label>
                    <label className="flex items-center gap-1">
                      Visita:
                      <input type="number" min={0} placeholder="45" value={s.visit_minutes}
                        onChange={(e) => atualizar(s.ponto.id, "visit_minutes", e.target.value)}
                        className="w-14 rounded border border-border bg-background px-1 py-0.5 text-xs" />
                    </label>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col">
                  <button onClick={() => mover(i, -1)} disabled={i === 0} className="rounded p-0.5 transition hover:bg-muted disabled:opacity-30" aria-label="Subir"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button onClick={() => mover(i, 1)} disabled={i === selecionadas.length - 1} className="rounded p-0.5 transition hover:bg-muted disabled:opacity-30" aria-label="Descer"><ArrowDown className="h-3.5 w-3.5" /></button>
                </div>
                <button onClick={() => remover(s.ponto.id)} className="shrink-0 rounded p-1 text-muted-foreground transition hover:bg-red-500/10 hover:text-red-600" aria-label={`Remover ${s.ponto.nome}`}><X className="h-4 w-4" /></button>
              </li>
            ))}
          </ol>

          {/* destino */}
          <div className="mt-1 flex items-center gap-2 rounded-md bg-[#00302b]/5 px-2 py-1.5 text-sm dark:bg-white/5">
            <MapPin className="h-4 w-4 text-[#00302b] dark:text-[#b4fcf1]" />
            <span className="font-medium">Destino</span>
            <span className="text-muted-foreground">{terminarNaBase ? BASE.label : destino.label}</span>
          </div>

          {excedeu && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" /> Acima do limite de {LIMITE_PARADAS} paradas por rota.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={otimizar} disabled={otimizando || selecionadas.length === 0}
              className="flex items-center gap-1.5 rounded-md bg-[#88005b] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#6d0049] disabled:opacity-50">
              <Route className="h-4 w-4" /> {otimizando ? "Otimizando…" : "Otimizar rota"}
            </button>
            <button onClick={salvar} disabled={salvando || selecionadas.length === 0}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium transition hover:bg-muted disabled:opacity-50">
              <Save className="h-4 w-4" /> {salvando ? "Salvando…" : "Salvar plano"}
            </button>
            <button onClick={abrirNavegacao} disabled={selecionadas.length === 0}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium transition hover:bg-muted disabled:opacity-50">
              <Navigation className="h-4 w-4" /> Abrir no Google Maps
            </button>
          </div>
        </div>

        {/* planos recentes */}
        {planosRecentes.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold">Planos recentes</h2>
            <ul className="flex flex-col gap-1 text-sm">
              {planosRecentes.map((p) => (
                <li key={p.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground">
                  <span className="font-medium text-foreground">{p.plan_date}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{p.status}</span>
                  {p.total_distance_m != null && <span className="ml-auto text-xs">{fmtDist(p.total_distance_m)} · {p.total_duration_s ? fmtDur(p.total_duration_s) : "—"}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}
