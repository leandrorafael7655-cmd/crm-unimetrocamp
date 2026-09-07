"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Map, {
  Marker,
  Popup,
  NavigationControl,
  GeolocateControl,
  type MapRef,
} from "react-map-gl/mapbox"
import Supercluster from "supercluster"
import useSWR from "swr"
import "mapbox-gl/dist/mapbox-gl.css"
import {
  Building2,
  GraduationCap,
  Loader2,
  MapPinOff,
  X,
  CalendarClock,
  User,
} from "lucide-react"
import type { PontoMapa, CamadaMapa, ResultadoMapa } from "@/lib/data/map-queries"

interface OpcoesFiltro {
  cidades: string[]
  etapas: string[]
  responsaveis: { id: string; nome: string }[]
}

interface Props {
  token: string
  opcoes: OpcoesFiltro
  centroInicial: { longitude: number; latitude: number; zoom: number }
}

type Filtros = {
  camada: CamadaMapa
  cidade: string
  responsavel: string
  convenio: "" | "sim" | "nao"
  etapa: string
  relacionamentoAtivo: boolean
  escolaEstrategica: boolean
  comAcaoAgendada: boolean
  comFollowupPendente: boolean
}

const FILTROS_INICIAIS: Filtros = {
  camada: "todos",
  cidade: "",
  responsavel: "",
  convenio: "",
  etapa: "",
  relacionamentoAtivo: false,
  escolaEstrategica: false,
  comAcaoAgendada: false,
  comFollowupPendente: false,
}

// Cores da marca por tipo; a saturação/opacidade reflete o estado do follow-up.
const COR_EMPRESA = "#88005b" // brand
const COR_ESCOLA = "#00302b" // brand-rail
const ANEL_ESTADO: Record<PontoMapa["estado"], string> = {
  critico: "#e11d48", // follow-up atrasado
  atencao: "#d97706", // vence hoje
  ok: "transparent",
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("Falha ao carregar pontos")
    return r.json() as Promise<ResultadoMapa>
  })

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function MapView({ token, opcoes, centroInicial }: Props) {
  const mapRef = useRef<MapRef>(null)
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIAIS)
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(null)
  const [zoom, setZoom] = useState(centroInicial.zoom)
  const [selecionado, setSelecionado] = useState<PontoMapa | null>(null)
  const [painelAberto, setPainelAberto] = useState(true)

  const bboxDebounced = useDebounced(bbox, 300)
  const filtrosDebounced = useDebounced(filtros, 200)

  // monta a query string para o route handler
  const queryUrl = useMemo(() => {
    if (!bboxDebounced) return null
    const [oeste, sul, leste, norte] = bboxDebounced
    const p = new URLSearchParams({
      oeste: String(oeste),
      sul: String(sul),
      leste: String(leste),
      norte: String(norte),
      camada: filtrosDebounced.camada,
    })
    if (filtrosDebounced.cidade) p.set("cidade", filtrosDebounced.cidade)
    if (filtrosDebounced.responsavel) p.set("responsavel", filtrosDebounced.responsavel)
    if (filtrosDebounced.convenio) p.set("convenio", filtrosDebounced.convenio)
    if (filtrosDebounced.etapa) p.set("etapa", filtrosDebounced.etapa)
    if (filtrosDebounced.relacionamentoAtivo) p.set("relacionamentoAtivo", "1")
    if (filtrosDebounced.escolaEstrategica) p.set("escolaEstrategica", "1")
    if (filtrosDebounced.comAcaoAgendada) p.set("comAcaoAgendada", "1")
    if (filtrosDebounced.comFollowupPendente) p.set("comFollowupPendente", "1")
    return `/api/mapa/pontos?${p.toString()}`
  }, [bboxDebounced, filtrosDebounced])

  const { data, isLoading, error } = useSWR(queryUrl, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  })

  const pontos = data?.pontos ?? []

  // Fecha o popup se o ponto selecionado deixou de existir no resultado
  // (ex.: após trocar de camada ou aplicar um filtro que o remove).
  useEffect(() => {
    if (selecionado && !pontos.some((p) => p.id === selecionado.id && p.tipo === selecionado.tipo)) {
      setSelecionado(null)
    }
  }, [pontos, selecionado])

  // ── clustering client-side com supercluster ──
  const cluster = useMemo(() => {
    const sc = new Supercluster<{ ponto: PontoMapa }>({ radius: 60, maxZoom: 16 })
    sc.load(
      pontos.map((pt: PontoMapa) => ({
        type: "Feature" as const,
        properties: { ponto: pt },
        geometry: { type: "Point" as const, coordinates: [pt.longitude, pt.latitude] },
      })),
    )
    return sc
  }, [pontos])

  const clusters = useMemo(() => {
    if (!bbox) return []
    return cluster.getClusters(bbox, Math.floor(zoom))
  }, [cluster, bbox, zoom])

  const atualizarBounds = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const b = map.getBounds()
    if (!b) return
    setBbox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()])
    setZoom(map.getZoom())
  }, [])

  const setF = <K extends keyof Filtros>(k: K, v: Filtros[K]) =>
    setFiltros((f) => ({ ...f, [k]: v }))

  const totalSemCoord = (data?.semCoordenada.empresas ?? 0) + (data?.semCoordenada.escolas ?? 0)

  return (
    <div className="relative h-full w-full">
      <Map
        ref={mapRef}
        mapboxAccessToken={token}
        initialViewState={centroInicial}
        mapStyle="mapbox://styles/mapbox/light-v11"
        onLoad={atualizarBounds}
        onMoveEnd={atualizarBounds}
        onZoomEnd={atualizarBounds}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <GeolocateControl
          position="top-right"
          trackUserLocation
          showUserHeading
          positionOptions={{ enableHighAccuracy: true }}
        />

        {clusters.map((c) => {
          const [lng, lat] = c.geometry.coordinates
          const props = c.properties as Supercluster.ClusterProperties &
            Supercluster.AnyProps
          if (props.cluster) {
            const count = props.point_count as number
            const size = 32 + Math.min(28, Math.log(count + 1) * 10)
            return (
              <Marker key={`cluster-${props.cluster_id}`} longitude={lng} latitude={lat}>
                <button
                  type="button"
                  onClick={() => {
                    const zoomAlvo = Math.min(
                      cluster.getClusterExpansionZoom(props.cluster_id as number),
                      18,
                    )
                    mapRef.current?.flyTo({ center: [lng, lat], zoom: zoomAlvo, duration: 600 })
                  }}
                  className="flex items-center justify-center rounded-full font-semibold text-white shadow-lg ring-2 ring-white/70"
                  style={{
                    width: size,
                    height: size,
                    background: COR_EMPRESA,
                    fontSize: count > 99 ? 12 : 14,
                  }}
                  aria-label={`Agrupamento com ${count} registros. Clique para ampliar.`}
                >
                  {count}
                </button>
              </Marker>
            )
          }
          const pt = (props as unknown as { ponto: PontoMapa }).ponto
          const cor = pt.tipo === "empresa" ? COR_EMPRESA : COR_ESCOLA
          const anel = ANEL_ESTADO[pt.estado]
          const Icone = pt.tipo === "empresa" ? Building2 : GraduationCap
          return (
            <Marker
              key={`${pt.tipo}-${pt.id}`}
              longitude={lng}
              latitude={lat}
              anchor="bottom"
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setSelecionado(pt)
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-white shadow-md transition hover:scale-110"
                style={{
                  background: cor,
                  boxShadow: anel !== "transparent" ? `0 0 0 3px ${anel}` : undefined,
                }}
                aria-label={`${pt.tipo === "empresa" ? "Empresa" : "Escola"}: ${pt.nome}`}
              >
                <Icone className="h-4 w-4" />
              </button>
            </Marker>
          )
        })}

        {selecionado && (
          <Popup
            longitude={selecionado.longitude}
            latitude={selecionado.latitude}
            anchor="bottom"
            offset={20}
            onClose={() => setSelecionado(null)}
            closeButton={false}
            maxWidth="300px"
          >
            <PopupCard ponto={selecionado} onClose={() => setSelecionado(null)} />
          </Popup>
        )}
      </Map>

      {/* Painel de filtros */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex max-w-full p-3">
        <div className="pointer-events-auto flex w-72 max-w-[85vw] flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Mapa comercial</h2>
            <button
              type="button"
              onClick={() => setPainelAberto((v) => !v)}
              className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              {painelAberto ? "Recolher" : "Filtros"}
            </button>
          </div>

          {painelAberto && (
            <div className="flex flex-col gap-3 overflow-y-auto px-4 py-3 text-sm">
              {/* Camada */}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Camada</label>
                <div className="flex gap-1 rounded-lg bg-muted p-1">
                  {(["todos", "empresas", "escolas"] as CamadaMapa[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setF("camada", c)}
                      className={`flex-1 rounded-md px-2 py-1 text-xs font-medium capitalize transition ${
                        filtros.camada === c
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <SelectFiltro
                label="Cidade"
                value={filtros.cidade}
                onChange={(v) => setF("cidade", v)}
                options={opcoes.cidades}
              />

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Responsável
                </label>
                <select
                  value={filtros.responsavel}
                  onChange={(e) => setF("responsavel", e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                >
                  <option value="">Todos</option>
                  {opcoes.responsaveis.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nome}
                    </option>
                  ))}
                </select>
              </div>

              {filtros.camada !== "escolas" && (
                <>
                  <SelectFiltro
                    label="Etapa (empresa)"
                    value={filtros.etapa}
                    onChange={(v) => setF("etapa", v)}
                    options={opcoes.etapas}
                  />
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Convênio
                    </label>
                    <select
                      value={filtros.convenio}
                      onChange={(e) => setF("convenio", e.target.value as Filtros["convenio"])}
                      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                    >
                      <option value="">Todos</option>
                      <option value="sim">Com convênio</option>
                      <option value="nao">Sem convênio</option>
                    </select>
                  </div>
                </>
              )}

              {filtros.camada !== "empresas" && (
                <div className="flex flex-col gap-2">
                  <CheckFiltro
                    label="Relacionamento ativo"
                    checked={filtros.relacionamentoAtivo}
                    onChange={(v) => setF("relacionamentoAtivo", v)}
                  />
                  <CheckFiltro
                    label="Escola estratégica"
                    checked={filtros.escolaEstrategica}
                    onChange={(v) => setF("escolaEstrategica", v)}
                  />
                </div>
              )}

              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <CheckFiltro
                  label="Com ação agendada"
                  checked={filtros.comAcaoAgendada}
                  onChange={(v) => setF("comAcaoAgendada", v)}
                />
                <CheckFiltro
                  label="Follow-up atrasado"
                  checked={filtros.comFollowupPendente}
                  onChange={(v) => setF("comFollowupPendente", v)}
                />
              </div>

              <button
                type="button"
                onClick={() => setFiltros(FILTROS_INICIAIS)}
                className="mt-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                Limpar filtros
              </button>

              {/* legenda */}
              <div className="mt-1 flex flex-col gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ background: COR_EMPRESA }} />
                  Empresas (B2B)
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ background: COR_ESCOLA }} />
                  Escolas (High School)
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full ring-2 ring-rose-500" />
                  Follow-up atrasado
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
        {isLoading && (
          <span className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-md">
            <Loader2 className="h-3 w-3 animate-spin" /> Carregando…
          </span>
        )}
        {data?.truncado && (
          <span className="pointer-events-auto rounded-full bg-amber-500 px-3 py-1.5 text-xs font-medium text-white shadow-md">
            Mostrando {data.teto} pontos — aproxime o zoom para ver todos
          </span>
        )}
        {error && (
          <span className="pointer-events-auto rounded-full bg-rose-600 px-3 py-1.5 text-xs font-medium text-white shadow-md">
            Erro ao carregar. Tente mover o mapa.
          </span>
        )}
      </div>

      {/* Aviso de entidades sem coordenada */}
      {totalSemCoord > 0 && (
        <div className="absolute right-3 top-20 z-10 flex max-w-[240px] items-start gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground shadow-md">
          <MapPinOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {totalSemCoord} registro(s) sem endereço localizado não aparecem no mapa.
          </span>
        </div>
      )}
    </div>
  )
}

function SelectFiltro({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
      >
        <option value="">Todas</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  )
}

function CheckFiltro({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-border accent-[#88005b]"
      />
      {label}
    </label>
  )
}

function PopupCard({ ponto, onClose }: { ponto: PontoMapa; onClose: () => void }) {
  const ehEmpresa = ponto.tipo === "empresa"
  return (
    <div className="w-full font-sans">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span
            className="flex h-5 w-5 items-center justify-center rounded-full text-white"
            style={{ background: ehEmpresa ? COR_EMPRESA : COR_ESCOLA }}
          >
            {ehEmpresa ? <Building2 className="h-3 w-3" /> : <GraduationCap className="h-3 w-3" />}
          </span>
          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            {ehEmpresa ? "Empresa" : "Escola"}
          </span>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar" className="text-slate-400 hover:text-slate-700">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <h3 className="text-sm font-semibold leading-snug text-slate-900">{ponto.nome}</h3>
      <div className="mt-1.5 flex flex-col gap-1 text-xs text-slate-600">
        {(ponto.bairro || ponto.cidade) && (
          <span>{[ponto.bairro, ponto.cidade].filter(Boolean).join(" · ")}</span>
        )}
        {ponto.etapaOuRelacionamento && (
          <span className="capitalize">
            {ehEmpresa ? "Etapa" : "Relacionamento"}: {ponto.etapaOuRelacionamento}
          </span>
        )}
        {ehEmpresa && ponto.convenio != null && (
          <span>Convênio: {ponto.convenio ? "Sim" : "Não"}</span>
        )}
        {!ehEmpresa && ponto.potencial && <span className="capitalize">Potencial: {ponto.potencial}</span>}
        {ponto.responsavelNome && (
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" /> {ponto.responsavelNome}
          </span>
        )}
        {ponto.dataProximaAcao && (
          <span className="flex items-center gap-1">
            <CalendarClock className="h-3 w-3" />
            {ponto.proximaAcao ? `${ponto.proximaAcao} · ` : ""}
            {new Date(ponto.dataProximaAcao + "T00:00:00").toLocaleDateString("pt-BR")}
          </span>
        )}
      </div>
      <a
        href={ehEmpresa ? `/?empresa=${ponto.id}` : `/high-school/escolas/${ponto.id}`}
        className="mt-2.5 inline-block rounded-md px-2.5 py-1 text-xs font-medium text-white"
        style={{ background: ehEmpresa ? COR_EMPRESA : COR_ESCOLA }}
      >
        Abrir ficha
      </a>
    </div>
  )
}
