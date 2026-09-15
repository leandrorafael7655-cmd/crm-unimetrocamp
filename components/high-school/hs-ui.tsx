import type { ReactNode } from "react"

/* Primitivas compartilhadas de apresentação.
   Mantêm superfícies claras e a hierarquia visual do UniConecta sem alterar
   as cores semânticas de status utilizadas pelos módulos. */

export function Card({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode
  className?: string
  as?: "div" | "section" | "article"
}) {
  return (
    <Tag
      className={`rounded-2xl border border-[#eadfe6] bg-white shadow-[0_1px_2px_rgba(54,16,39,0.025),0_10px_28px_rgba(54,16,39,0.035)] ${className}`}
    >
      {children}
    </Tag>
  )
}

export function SectionTitle({ children, acao }: { children: ReactNode; acao?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="text-sm font-semibold text-slate-800">{children}</h2>
      {acao}
    </div>
  )
}

export function Stat({
  rotulo,
  valor,
  detalhe,
  destaque = false,
}: {
  rotulo: string
  valor: ReactNode
  detalhe?: string
  destaque?: boolean
}) {
  return (
    <Card className={`p-4 ${destaque ? "ring-1 ring-brand/20" : ""}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{rotulo}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${destaque ? "text-brand" : "text-slate-900"}`}>
        {valor}
      </p>
      {detalhe && <p className="mt-0.5 text-xs text-slate-400">{detalhe}</p>}
    </Card>
  )
}

export function Chip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${className || "border-slate-200 bg-slate-50 text-slate-600"}`}
    >
      {children}
    </span>
  )
}

export function EmptyState({ titulo, descricao, acao }: { titulo: string; descricao?: string; acao?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="text-sm font-medium text-slate-700">{titulo}</p>
      {descricao && <p className="max-w-md text-sm text-slate-400">{descricao}</p>}
      {acao && <div className="mt-2">{acao}</div>}
    </Card>
  )
}

export function PageHeader({ titulo, descricao, acao }: { titulo: string; descricao?: string; acao?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-[#eee3e9] pb-4">
      <div>
        <div className="mb-2 h-1 w-8 rounded-full bg-[#ff5b16]" aria-hidden />
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-slate-900 text-balance sm:text-2xl">{titulo}</h1>
        {descricao && <p className="mt-1 text-sm text-slate-500">{descricao}</p>}
      </div>
      {acao}
    </header>
  )
}
