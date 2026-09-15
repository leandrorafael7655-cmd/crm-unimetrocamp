"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Search, Plus, X, ArrowUp, ArrowDown, Route, Save, Navigation, MapPin,
  Clock, Building2, GraduationCap, Sparkles, LocateFixed, AlertTriangle,
  CheckCircle2, Home, Pencil, FolderOpen,
} from "lucide-react"
import {
  otimizarRotaAction, salvarPlanoAction, sugerirProximidadeAction,
  type ParadaPayload,
} from "@/app/actions/routes"
import {
  carregarPlanoSalvoAction,
  salvarMeuEnderecoAction,
} from "@/app/actions/route-preferences"
import { UNIMETROCAMP_ORIGIN } from "@/lib/domain/route-origins"

/* ── tipos locais (evita importar módulos server-only no cliente) ── */
type Tipo = "company" | "school"
type OrigemModo = "campus" | "home" | "gps" | "saved"
type DestinoModo = "same" | "campus" | "home" | "saved"

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
interface MeuEndereco {
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  cep: string
  lat: number
  lng: number
  label: string
}
interface CoordRotulo {
  lat: number
  lng: number
  label: string
}

const CAMPUS: CoordRotulo = {
  lat: UNIMETROCAMP_ORIGIN.lat,
  lng: UNIMETROCAMP_ORIGIN.lng,
  label: UNIMETROCAMP_ORIGIN.label,
}
const LIMITE_PARADAS = 10 // origem + destino + 10 = 12 coords (limite Mapbox v1)

function fmtDur(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`
}
function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`
}
function brData(iso: string): string {
  const [a, m, d] = iso.split("-")
  return a && m && d ? `${d}/${m}/${a}` : iso
}
function perto(a: { lat: number; lng: number }, b: { lat: number; lng: number }, tolerancia = 0.001): boolean {
  return Math.abs(a.lat - b.lat) <= tolerancia && Math.abs(a.lng - b.lng) <= tolerancia
}

export function RoutePlanner({
  pontos,
  planosRecentes,
  meuEnderecoInicial,
}: {
  pontos: Ponto[]
  planosRecentes: PlanoResumo[]
  meuEnderecoInicial: MeuEndereco | null
}) {
  const router = useRouter()
  const [planDate, setPlanDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [meuEndereco, setMeuEndereco] = useState<MeuEndereco | null>(meuEnderecoInicial)
  const [origemModo, setOrigemModo] = useState<OrigemModo>("campus")
  const [origem, setOrigem] = useState<CoordRotulo>({ ...CAMPUS })
  const [destinoModo, setDestinoModo] = useState<DestinoModo>("same")
  const [destinoSalvo, setDestinoSalvo] = useState<CoordRotulo | null>(null)
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
  const [mostrarEndereco, setMostrarEndereco] = useState(false)
  const [formEndereco, setFormEndereco] = useState({
    logradouro: meuEnderecoInicial?.logradouro ?? "",
    numero: meuEnderecoInicial?.numero ?? "",
    complemento: meuEnderecoInicial?.complemento ?? "",
    bairro: meuEnderecoInicial?.bairro ?? "",
    cidade: meuEnderecoInicial?.cidade ?? "Campinas",
    cep: meuEnderecoInicial?.cep ?? "",
  })

  const [otimizando, iniciarOtimizacao] = useTransition()
  const [salvando, iniciarSalvar] = useTransition()
  const [sugerindo, iniciarSugestao] = useTransition()
  const [abrindo, iniciarAbrir] = useTransition()
  const [salvandoEndereco, iniciarSalvarEndereco] = useTransition()

  const idsSelecionados = useMemo(() => new Set(selecionadas.map((s) => s.ponto.id)), [selecionadas])
  const mapaPontos = useMemo(() => new Map(pontos.map((p) => [`${p.tipo}:${p.id}`, p])), [pontos])

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const base = pontos.filter((p) => !idsSelecionados.has(p.id))
    if (!t) return base.slice(0, 40)
    return base
      .filter((p) => p.nome.toLowerCase().includes(t) || (p.cidade ?? "").toLowerCase().includes(t))
      .slice(0, 40)
  }, [pontos, busca, idsSelecionados])

  const destinoFinal = useMemo<CoordRotulo>(() => {
    if (destinoModo === "same") return origem
    if (destinoModo === "campus") return { ...CAMPUS }
    if (destinoModo === "home" && meuEndereco) {
      return { lat: meuEndereco.lat, lng: meuEndereco.lng, label: meuEndereco.label }
    }
    if (destinoModo === "saved" && destinoSalvo) return destinoSalvo
    return origem
  }, [destinoModo, destinoSalvo, meuEndereco, origem])

  function resetarResultado() {
    setOtimizado(false)
    setTotais(null)
    setAviso(null)
  }

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
    setAviso({ tipo: "erro", texto: "Ordem alterada manualmente — otimize novamente se quiser recalcular a rota." })
  }
  function atualizar(id: string, campo: "fixed_time" | "visit_minutes", valor: string) {
    setSelecionadas((prev) => prev.map((s) => (s.ponto.id === id ? { ...s, [campo]: valor } : s)))
  }

  function selecionarOrigem(modo: OrigemModo) {
    if (modo === "campus") {
      setOrigemModo("campus")
      setOrigem({ ...CAMPUS })
      resetarResultado()
      return
    }
    if (modo === "home") {
      if (!meuEndereco) {
        setMostrarEndereco(true)
        setAviso({ tipo: "erro", texto: "Cadastre seu endereço antes de usá-lo como ponto de partida." })
        return
      }
      setOrigemModo("home")
      setOrigem({ lat: meuEndereco.lat, lng: meuEndereco.lng, label: meuEndereco.label })
      resetarResultado()
    }
  }

  function usarMinhaLocalizacao() {
    if (!navigator.geolocation) {
      setAviso({ tipo: "erro", texto: "Geolocalização indisponível neste navegador." })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigemModo("gps")
        setOrigem({ lng: pos.coords.longitude, lat: pos.coords.latitude, label: "Minha localização atual" })
        setAviso({ tipo: "ok", texto: "Origem definida pela localização atual. Ela vale apenas para esta rota." })
        setOtimizado(false)
      },
      () => setAviso({ tipo: "erro", texto: "Não foi possível obter sua localização (permissão negada?)." }),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  function salvarEndereco() {
    iniciarSalvarEndereco(async () => {
      const r = await salvarMeuEnderecoAction(formEndereco)
      if (!r.ok || !r.endereco) {
        setAviso({ tipo: "erro", texto: r.message })
        return
      }
      setMeuEndereco(r.endereco)
      setOrigemModo("home")
      setOrigem({ lat: r.endereco.lat, lng: r.endereco.lng, label: r.endereco.label })
      setMostrarEndereco(false)
      setAviso({ tipo: "ok", texto: r.message })
      setOtimizado(false)
      router.refresh()
    })
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
        texto: `Você tem ${selecionadas.length} paradas. O limite por rota é ${LIMITE_PARADAS}. Divida em dois dias ou remova paradas.`,
      })
      return
    }
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
      }
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
        setAviso({ tipo: "ok", texto: "Plano salvo. Você poderá reabri-lo em Planos recentes." })
        router.refresh()
      } else {
        setAviso({ tipo: "erro", texto: r.message ?? "Erro ao salvar." })
      }
    })
  }

  function abrirPlano(id: string) {
    iniciarAbrir(async () => {
      const r = await carregarPlanoSalvoAction(id)
      if (!r) {
        setAviso({ tipo: "erro", texto: "Não foi possível abrir esse plano." })
        return
      }

      const carregadas: Selecionada[] = []
      let ignoradas = 0
      for (const s of r.paradas) {
        const existente = mapaPontos.get(`${s.entity_type}:${s.entity_id}`)
        if (existente) {
          carregadas.push({
            ponto: existente,
            fixed_time: s.fixed_time ?? "",
            visit_minutes: s.visit_minutes == null ? "" : String(s.visit_minutes),
            eta: s.estimated_arrival ?? undefined,
          })
        } else if (s.lat != null && s.lng != null) {
          carregadas.push({
            ponto: {
              id: s.entity_id,
              tipo: s.entity_type,
              nome: s.nome,
              cidade: s.cidade,
              bairro: null,
              lat: s.lat,
              lng: s.lng,
              etapa: null,
              classificacao: null,
              dono: null,
            },
            fixed_time: s.fixed_time ?? "",
            visit_minutes: s.visit_minutes == null ? "" : String(s.visit_minutes),
            eta: s.estimated_arrival ?? undefined,
          })
        } else {
          ignoradas++
        }
      }

      const origemCarregada: CoordRotulo = {
        lat: r.origin_lat ?? CAMPUS.lat,
        lng: r.origin_lng ?? CAMPUS.lng,
        label: r.origin_label ?? CAMPUS.label,
      }
      setOrigem(origemCarregada)
      if (perto(origemCarregada, CAMPUS)) setOrigemModo("campus")
      else if (meuEndereco && perto(origemCarregada, meuEndereco)) setOrigemModo("home")
      else setOrigemModo("saved")

      const destinoCarregado: CoordRotulo = {
        lat: r.destination_lat ?? origemCarregada.lat,
        lng: r.destination_lng ?? origemCarregada.lng,
        label: r.destination_label ?? origemCarregada.label,
      }
      if (perto(destinoCarregado, origemCarregada)) {
        setDestinoModo("same")
        setDestinoSalvo(null)
      } else if (perto(destinoCarregado, CAMPUS)) {
        setDestinoModo("campus")
        setDestinoSalvo(null)
      } else if (meuEndereco && perto(destinoCarregado, meuEndereco)) {
        setDestinoModo("home")
        setDestinoSalvo(null)
      } else {
        setDestinoModo("saved")
        setDestinoSalvo(destinoCarregado)
      }

      setPlanoId(r.id)
      setPlanDate(r.plan_date)
      setDeparture((r.departure_time ?? "08:00").slice(0, 5))
      setReturnTime((r.return_time ?? "").slice(0, 5))
      setAvgVisit(String(r.avg_visit_minutes ?? 45))
      setSelecionadas(carregadas)
      setOtimizado(r.status === "otimizada" || Boolean(r.optimized_at))
      setTotais(
        r.total_distance_m != null && r.total_duration_s != null
          ? { dist: r.total_distance_m, dur: r.total_duration_s }
          : null,
      )
      setSugestoes([])
      setAviso({
        tipo: ignoradas ? "erro" : "ok",
        texto: ignoradas
          ? `Plano aberto, mas ${ignoradas} parada(s) sem coordenadas foram ignoradas.`
          : "Plano salvo aberto. Você pode editar, otimizar novamente ou abrir no Google Maps.",
      })
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

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Ponto de partida</span>
              <select
                value={origemModo === "gps" || origemModo === "saved" ? origemModo : origemModo}
                onChange={(e) => selecionarOrigem(e.target.value as OrigemModo)}
                className="rounded-md border border-border bg-background px-2 py-2 text-sm"
              >
                <option value="campus">UniMetrocamp</option>
                <option value="home">Meu endereço</option>
                {origemModo === "gps" && <option value="gps">Minha localização atual</option>}
                {origemModo === "saved" && <option value="saved">Origem do plano salvo</option>}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Destino final</span>
              <select
                value={destinoModo}
                onChange={(e) => { setDestinoModo(e.target.value as DestinoModo); resetarResultado() }}
                className="rounded-md border border-border bg-background px-2 py-2 text-sm"
              >
                <option value="same">Voltar ao ponto de partida</option>
                <option value="campus">UniMetrocamp</option>
                {meuEndereco && <option value="home">Meu endereço</option>}
                {destinoModo === "saved" && <option value="saved">Destino do plano salvo</option>}
              </select>
            </label>
          </div>

          <div className="mt-3 rounded-md border border-border/70 bg-muted/30 p-3">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#88005b]" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{origem.label}</p>
                {origemModo === "campus" && <p className="text-xs text-muted-foreground">{UNIMETROCAMP_ORIGIN.address}</p>}
                {origemModo === "home" && meuEndereco && <p className="text-xs text-muted-foreground">Endereço pessoal salvo apenas para sua conta.</p>}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={() => setMostrarEndereco((v) => !v)}
                className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 text-xs transition hover:bg-muted">
                {meuEndereco ? <Pencil className="h-3.5 w-3.5" /> : <Home className="h-3.5 w-3.5" />}
                {meuEndereco ? "Editar meu endereço" : "Cadastrar meu endereço"}
              </button>
              <button onClick={usarMinhaLocalizacao}
                className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 text-xs transition hover:bg-muted">
                <LocateFixed className="h-3.5 w-3.5" /> Usar localização atual
              </button>
            </div>
          </div>

          {mostrarEndereco && (
            <div className="mt-3 rounded-md border border-[#88005b]/20 bg-[#88005b]/5 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Meu endereço</p>
                  <p className="text-xs text-muted-foreground">Privado: cada usuário vê apenas o próprio endereço.</p>
                </div>
                <button onClick={() => setMostrarEndereco(false)} className="rounded p-1 hover:bg-muted" aria-label="Fechar"><X className="h-4 w-4" /></button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input placeholder="Rua / avenida" value={formEndereco.logradouro}
                  onChange={(e) => setFormEndereco({ ...formEndereco, logradouro: e.target.value })}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
                <input placeholder="Número" value={formEndereco.numero}
                  onChange={(e) => setFormEndereco({ ...formEndereco, numero: e.target.value })}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
                <input placeholder="Complemento" value={formEndereco.complemento}
                  onChange={(e) => setFormEndereco({ ...formEndereco, complemento: e.target.value })}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
                <input placeholder="Bairro" value={formEndereco.bairro}
                  onChange={(e) => setFormEndereco({ ...formEndereco, bairro: e.target.value })}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
                <input placeholder="Cidade" value={formEndereco.cidade}
                  onChange={(e) => setFormEndereco({ ...formEndereco, cidade: e.target.value })}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
                <input placeholder="CEP" value={formEndereco.cep}
                  onChange={(e) => setFormEndereco({ ...formEndereco, cep: e.target.value })}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
              </div>
              <button onClick={salvarEndereco} disabled={salvandoEndereco}
                className="mt-3 flex items-center gap-1.5 rounded-md bg-[#00302b] px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50">
                <Save className="h-4 w-4" /> {salvandoEndereco ? "Localizando e salvando…" : "Salvar meu endereço"}
              </button>
            </div>
          )}
        </div>

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
            {planoId && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">plano aberto</span>}
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

          <div className="mb-1 flex items-center gap-2 rounded-md bg-[#00302b]/5 px-2 py-1.5 text-sm dark:bg-white/5">
            <MapPin className="h-4 w-4 text-[#00302b] dark:text-[#b4fcf1]" />
            <span className="font-medium">Origem</span>
            <span className="truncate text-muted-foreground">{origem.label} · {departure}</span>
          </div>

          <ol className="flex flex-col gap-1.5">
            {selecionadas.length === 0 && (
              <li className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                Nenhuma parada. Adicione empresas e escolas à esquerda ou abra um plano salvo.
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

          <div className="mt-1 flex items-center gap-2 rounded-md bg-[#00302b]/5 px-2 py-1.5 text-sm dark:bg-white/5">
            <MapPin className="h-4 w-4 text-[#00302b] dark:text-[#b4fcf1]" />
            <span className="font-medium">Destino</span>
            <span className="truncate text-muted-foreground">{destinoFinal.label}</span>
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
              <Save className="h-4 w-4" /> {salvando ? "Salvando…" : planoId ? "Atualizar plano" : "Salvar plano"}
            </button>
            <button onClick={abrirNavegacao} disabled={selecionadas.length === 0}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium transition hover:bg-muted disabled:opacity-50">
              <Navigation className="h-4 w-4" /> Abrir no Google Maps
            </button>
          </div>
        </div>

        {planosRecentes.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-[#88005b]" />
              <h2 className="text-sm font-semibold">Planos recentes</h2>
              <span className="text-xs text-muted-foreground">clique para reabrir</span>
            </div>
            <ul className="flex flex-col gap-1 text-sm">
              {planosRecentes.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => abrirPlano(p.id)}
                    disabled={abrindo}
                    className={`flex w-full items-center gap-2 rounded-md border px-2 py-2 text-left transition hover:bg-muted disabled:opacity-50 ${
                      planoId === p.id ? "border-[#88005b]/40 bg-[#88005b]/5" : "border-transparent"
                    }`}
                  >
                    <span className="font-medium text-foreground">{brData(p.plan_date)}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{p.status}</span>
                    {p.total_distance_m != null && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        {fmtDist(p.total_distance_m)} · {p.total_duration_s ? fmtDur(p.total_duration_s) : "—"}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-xs font-medium text-[#88005b]">
                      <FolderOpen className="h-3.5 w-3.5" /> Abrir
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}
