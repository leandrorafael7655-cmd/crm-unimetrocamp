"use client"

import { useMemo } from "react"

export interface PontoCurva {
  data: string // ISO date
  valor: number
}

/**
 * Curva de evolução de inscrições — gráfico de linha SVG leve, sem dependências.
 * Desenha os snapshots oficiais ao longo do tempo com uma linha de meta opcional.
 */
export function CurvaEvolucao({
  pontos,
  meta,
  unidade = "inscrições",
}: {
  pontos: PontoCurva[]
  meta?: number
  unidade?: string
}) {
  const W = 720
  const H = 240
  const P = { top: 16, right: 16, bottom: 28, left: 40 }

  const { path, area, marcadores, maxY, ticks } = useMemo(() => {
    if (pontos.length === 0) {
      return { path: "", area: "", marcadores: [] as { x: number; y: number; p: PontoCurva }[], maxY: 0, ticks: [] as number[] }
    }
    const innerW = W - P.left - P.right
    const innerH = H - P.top - P.bottom
    const maxValor = Math.max(meta ?? 0, ...pontos.map((p) => p.valor), 1)
    const maxY = Math.ceil(maxValor / 5) * 5 || 5
    const n = pontos.length
    const px = (i: number) => P.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW)
    const py = (v: number) => P.top + innerH - (v / maxY) * innerH

    const pts = pontos.map((p, i) => ({ x: px(i), y: py(p.valor), p }))
    const path = pts.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ")
    const area =
      pts.length > 0
        ? `${path} L${pts[pts.length - 1].x.toFixed(1)},${(P.top + innerH).toFixed(1)} L${pts[0].x.toFixed(1)},${(P.top + innerH).toFixed(1)} Z`
        : ""
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxY * t))
    return { path, area, marcadores: pts, maxY, ticks }
  }, [pontos, meta])

  if (pontos.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-400">
        Sem leituras oficiais registradas ainda.
      </div>
    )
  }

  const innerH = H - P.top - P.bottom
  const yMeta = meta != null ? P.top + innerH - (meta / maxY) * innerH : null

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Curva de evolução de inscrições">
      {ticks.map((t) => {
        const y = P.top + innerH - (t / maxY) * innerH
        return (
          <g key={t}>
            <line x1={P.left} y1={y} x2={W - P.right} y2={y} stroke="currentColor" className="text-slate-200" strokeWidth={1} />
            <text x={P.left - 6} y={y + 3} textAnchor="end" className="fill-slate-400 text-[10px]">
              {t}
            </text>
          </g>
        )
      })}

      {yMeta != null && (
        <line
          x1={P.left}
          y1={yMeta}
          x2={W - P.right}
          y2={yMeta}
          stroke="currentColor"
          className="text-brand"
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />
      )}

      <path d={area} className="fill-brand/10" />
      <path d={path} fill="none" stroke="currentColor" className="text-brand" strokeWidth={2} />

      {marcadores.map((m, i) => (
        <g key={i}>
          <circle cx={m.x} cy={m.y} r={3.5} className="fill-brand" />
          {(i === 0 || i === marcadores.length - 1) && (
            <text x={m.x} y={m.y - 8} textAnchor="middle" className="fill-slate-600 text-[10px] font-medium">
              {m.p.valor}
            </text>
          )}
        </g>
      ))}

      {marcadores.map((m, i) =>
        i === 0 || i === marcadores.length - 1 ? (
          <text key={`d-${i}`} x={m.x} y={H - 10} textAnchor="middle" className="fill-slate-400 text-[10px]">
            {new Date(m.p.data + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
          </text>
        ) : null,
      )}
    </svg>
  )
}
