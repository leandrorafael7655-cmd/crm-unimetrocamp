"use client"

import { useActionState } from "react"
import { backfillFechamentoSemanal } from "@/app/actions/weekly"
import { History, Loader2 } from "lucide-react"

type Estado =
  | { status: "idle" }
  | { status: "ok"; criados: number; avaliados: number; de: string | null; ate: string }
  | { status: "erro"; message: string }

async function acao(_prev: Estado): Promise<Estado> {
  const r = await backfillFechamentoSemanal()
  if (r.ok) return { status: "ok", criados: r.criados, avaliados: r.avaliados, de: r.de, ate: r.ate }
  return { status: "erro", message: r.message }
}

export function BackfillControl() {
  const [estado, formAction, pendente] = useActionState(acao, { status: "idle" } as Estado)

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-md bg-slate-100 p-2 text-slate-600">
          <History className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-900">Reconstruir histórico de aderência</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Congela todas as semanas encerradas desde a primeira meta semanal. Use se o fechamento automático não
            rodou. É seguro reexecutar — não duplica registros.
          </p>

          <form action={formAction} className="mt-3">
            <button
              type="submit"
              disabled={pendente}
              className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
            >
              {pendente ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {pendente ? "Reconstruindo…" : "Reconstruir agora"}
            </button>
          </form>

          {estado.status === "ok" ? (
            <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800" role="status">
              {estado.criados > 0
                ? `${estado.criados} semana(s) congelada(s)`
                : "Nenhuma semana pendente"}
              {estado.de ? ` · janela ${estado.de} → ${estado.ate}` : " · nenhuma meta semanal cadastrada"}
              {` · ${estado.avaliados} avaliação(ões)`}
            </p>
          ) : null}
          {estado.status === "erro" ? (
            <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
              {estado.message}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
