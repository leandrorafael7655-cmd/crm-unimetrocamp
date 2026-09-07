import type { ReactNode } from "react"
import Link from "next/link"
import { Card } from "@/components/high-school/hs-ui"
import { ArrowRight, TriangleAlert } from "lucide-react"

/* Primitivas de apresentação do Dashboard Geral. Sem estado; usadas por Server
   Components. Mantêm a identidade da marca (destaques em magenta/brand). */

/** Bloco de módulo: cabeçalho com título, subtítulo e link "abrir módulo". */
export function BlocoModulo({
  titulo,
  subtitulo,
  href,
  hrefRotulo,
  children,
}: {
  titulo: string
  subtitulo?: string
  href?: string
  hrefRotulo?: string
  children: ReactNode
}) {
  return (
    <Card as="section" className="flex flex-col p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">{titulo}</h2>
          {subtitulo && <p className="mt-0.5 text-xs text-slate-400">{subtitulo}</p>}
        </div>
        {href && (
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand hover:underline"
          >
            {hrefRotulo ?? "Abrir"}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </Card>
  )
}

/** KPI compacto: número em destaque + rótulo, opcionalmente em tom de alerta. */
export function Kpi({
  rotulo,
  valor,
  tom = "neutro",
  detalhe,
}: {
  rotulo: string
  valor: ReactNode
  tom?: "neutro" | "alerta" | "critico" | "ok" | "brand"
  detalhe?: string
}) {
  const cor =
    tom === "critico"
      ? "text-rose-600"
      : tom === "alerta"
        ? "text-amber-600"
        : tom === "ok"
          ? "text-emerald-600"
          : tom === "brand"
            ? "text-brand"
            : "text-slate-900"
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${cor}`}>{valor}</p>
      {detalhe && <p className="mt-0.5 text-[11px] text-slate-400">{detalhe}</p>}
    </div>
  )
}

/** Grade responsiva de KPIs. */
export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{children}</div>
}

/** Estado de erro por bloco: o dashboard não quebra inteiro se uma fonte falha. */
export function BlocoErro({ mensagem }: { mensagem?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>
        <p className="font-medium">Não foi possível carregar este bloco</p>
        <p className="mt-0.5 text-xs text-amber-700">
          {mensagem || "Tente atualizar a página em instantes."}
        </p>
      </div>
    </div>
  )
}

/** Estado vazio discreto dentro de um bloco. */
export function BlocoVazio({ texto }: { texto: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-center text-sm text-slate-400">
      {texto}
    </div>
  )
}
