import type { ReactNode } from "react"
import { Card } from "@/components/high-school/hs-ui"
import { calcularProgresso, mensagemMetaSemanal } from "@/lib/domain/goals"

/** Barra de progresso acessível, cor conforme atingimento. */
export function BarraProgresso({ pct, tom = "auto" }: { pct: number; tom?: "auto" | "brand" }) {
  const clamped = Math.max(0, Math.min(100, pct))
  const cor =
    tom === "brand"
      ? "bg-brand"
      : pct >= 100
        ? "bg-emerald-500"
        : pct >= 60
          ? "bg-brand"
          : pct >= 30
            ? "bg-amber-500"
            : "bg-rose-500"
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={`h-full rounded-full transition-all ${cor}`} style={{ width: `${clamped}%` }} />
    </div>
  )
}

/**
 * Card de meta reutilizável: meta, atual, atingimento, faltante e barra.
 * O denominador é sempre o alvo informado (meta geral OU individual) — nunca
 * a soma de individuais.
 */
export function GoalCard({
  titulo,
  alvo,
  atual,
  unidade,
  detalhe,
  acao,
}: {
  titulo: string
  alvo: number
  atual: number
  unidade?: string
  detalhe?: ReactNode
  acao?: ReactNode
}) {
  const p = calcularProgresso(alvo, atual)
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-700 text-pretty">{titulo}</p>
        {acao}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-slate-900">
          {atual.toLocaleString("pt-BR")}
        </span>
        <span className="text-sm text-slate-400">
          / {alvo.toLocaleString("pt-BR")} {unidade}
        </span>
      </div>
      <div className="mt-2">
        <BarraProgresso pct={p.atingimentoPct} />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs">
        <span className="font-medium tabular-nums text-slate-600">{p.atingimentoPct}%</span>
        <span className="tabular-nums text-slate-400">
          {p.faltante > 0 ? `Faltam ${p.faltante.toLocaleString("pt-BR")}` : "Meta atingida"}
        </span>
      </div>
      {detalhe && <div className="mt-2 text-xs text-slate-500">{detalhe}</div>}
    </Card>
  )
}

const TONS_SEMANA = {
  ok: { faixa: "bg-emerald-500", texto: "text-emerald-700", fundo: "bg-emerald-50" },
  info: { faixa: "bg-brand", texto: "text-slate-700", fundo: "bg-brand/5" },
  atencao: { faixa: "bg-amber-500", texto: "text-amber-800", fundo: "bg-amber-50" },
  critico: { faixa: "bg-rose-500", texto: "text-rose-800", fundo: "bg-rose-50" },
} as const

/**
 * Card "Minhas ações da semana" para o dashboard do consultor.
 * A mensagem escala por dia da semana (informativo segunda → prioridade sexta),
 * sem notificação externa — o alerta vive dentro do CRM.
 */
export function SemanaAtualCard({
  completadas,
  alvo,
  empresas,
}: {
  completadas: number
  alvo: number
  empresas?: number
}) {
  const msg = mensagemMetaSemanal(completadas, alvo)
  const p = calcularProgresso(alvo, completadas)
  const t = TONS_SEMANA[msg.tom]
  return (
    <Card className="overflow-hidden p-0">
      <div className={`flex items-center gap-2 px-4 py-2 ${t.fundo}`}>
        <span className={`h-2 w-2 rounded-full ${t.faixa}`} aria-hidden />
        <span className={`text-xs font-medium ${t.texto}`}>Minhas ações da semana</span>
      </div>
      <div className="p-4">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums text-slate-900">{completadas}</span>
          <span className="text-sm text-slate-400">/ {alvo} ações</span>
        </div>
        <div className="mt-2">
          <BarraProgresso pct={p.atingimentoPct} />
        </div>
        <p className={`mt-3 text-sm ${t.texto}`}>{msg.texto}</p>
        {empresas != null && (
          <p className="mt-1 text-xs text-slate-400">{empresas} empresa(s) distinta(s) nesta semana</p>
        )}
      </div>
    </Card>
  )
}

/** Card de aderência de campo (semanas atingidas ÷ aplicáveis). */
export function AderenciaCard({
  titulo,
  aderenciaPct,
  atingidas,
  aplicaveis,
  detalhe,
}: {
  titulo: string
  aderenciaPct: number
  atingidas: number
  aplicaveis: number
  detalhe?: ReactNode
}) {
  return (
    <Card className="p-4">
      <p className="text-sm font-medium text-slate-700">{titulo}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-slate-900">{aderenciaPct}%</span>
        <span className="text-sm text-slate-400">
          {atingidas}/{aplicaveis} semanas
        </span>
      </div>
      <div className="mt-2">
        <BarraProgresso pct={aderenciaPct} />
      </div>
      {detalhe && <div className="mt-2 text-xs text-slate-500">{detalhe}</div>}
    </Card>
  )
}
