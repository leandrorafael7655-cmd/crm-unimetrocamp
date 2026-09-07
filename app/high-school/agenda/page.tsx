import Link from "next/link"
import { listActions } from "@/lib/data/high-school-queries"
import { PageHeader, Card, Chip, EmptyState } from "@/components/high-school/hs-ui"
import { STATUS_ACAO_HS, CORES_STATUS_ACAO } from "@/lib/domain/high-school"

export const dynamic = "force-dynamic"

function fmtData(iso: string) {
  if (!iso) return "—"
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const acoes = await listActions({ status })

  // agrupa por data
  const grupos = new Map<string, typeof acoes>()
  for (const a of acoes) {
    const arr = grupos.get(a.data) ?? []
    arr.push(a)
    grupos.set(a.data, arr)
  }
  const datasOrdenadas = Array.from(grupos.keys()).sort()

  return (
    <>
      <PageHeader
        titulo="Agenda de ações"
        descricao="Visitas, palestras e aplicações do SuperVest nas escolas"
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link
          href="/high-school/agenda"
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
            !status ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Todas
        </Link>
        {STATUS_ACAO_HS.map((s) => (
          <Link
            key={s}
            href={`/high-school/agenda?status=${s}`}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
              status === s ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {s}
          </Link>
        ))}
      </div>

      {datasOrdenadas.length === 0 ? (
        <EmptyState titulo="Nenhuma ação encontrada" descricao="Não há ações para este filtro." />
      ) : (
        <div className="space-y-6">
          {datasOrdenadas.map((data) => (
            <div key={data} className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                {fmtData(data)}
                <span className="text-xs font-normal text-slate-400">
                  {grupos.get(data)!.length} ação(ões)
                </span>
              </div>
              <div className="space-y-2">
                {grupos.get(data)!.map((a) => (
                  <Link key={a.id} href={`/high-school/escolas/${a.escolaId}`}>
                    <Card className="flex flex-wrap items-center justify-between gap-3 p-3 transition hover:border-brand/40">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {a.escolaNome ?? "Escola"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {a.tipo}
                          {a.inicio ? ` · ${a.inicio.slice(0, 5)}` : ""}
                          {a.objetivo ? ` · ${a.objetivo}` : ""}
                        </p>
                      </div>
                      <Chip className={CORES_STATUS_ACAO[a.status]}>
                        <span className="capitalize">{a.status}</span>
                      </Chip>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
