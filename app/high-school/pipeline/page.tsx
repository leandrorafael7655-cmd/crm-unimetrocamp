import Link from "next/link"
import { listSchools } from "@/lib/data/high-school-queries"
import { CORES_CLASSIFICACAO_HS, ETAPAS_HS, CORES_ETAPA_HS } from "@/lib/domain/high-school"
import { PageHeader, Chip } from "@/components/high-school/hs-ui"

export const dynamic = "force-dynamic"

const PESO_CLASSIFICACAO: Record<string, number> = {
  Ouro: 3,
  Prata: 2,
  Bronze: 1,
}

export default async function PipelinePage() {
  const escolas = await listSchools()

  const colunas = ETAPAS_HS.map((etapa) => ({
    etapa,
    itens: escolas
      .filter((e) => e.etapa === etapa)
      .sort((a, b) => {
        const porClassificacao = (PESO_CLASSIFICACAO[b.classificacao || ""] ?? 0) - (PESO_CLASSIFICACAO[a.classificacao || ""] ?? 0)
        return porClassificacao || a.nome.localeCompare(b.nome, "pt-BR")
      }),
  }))

  return (
    <>
      <PageHeader titulo="Pipeline High School" descricao="Relacionamento com escolas por etapa · Ouro primeiro" />

      <div className="flex gap-3 overflow-x-auto pb-4">
        {colunas.map(({ etapa, itens }) => (
          <div key={etapa} className="flex w-64 shrink-0 flex-col">
            <div className="mb-2 flex items-center justify-between">
              <Chip className={CORES_ETAPA_HS[etapa]}>{etapa}</Chip>
              <span className="text-xs font-medium text-slate-400 tabular-nums">{itens.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {itens.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
                  Nenhuma escola
                </p>
              ) : (
                itens.map((e) => (
                  <Link
                    key={e.id}
                    href={`/high-school/escolas/${e.id}`}
                    className="rounded-lg border border-slate-200 bg-white p-3 transition hover:border-brand/40 hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 text-sm font-medium text-slate-800">{e.nome}</p>
                      {e.classificacao && (
                        <Chip className={CORES_CLASSIFICACAO_HS[e.classificacao]}>{e.classificacao}</Chip>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {e.cidade || "Sem cidade"} · {e.rede}
                    </p>
                    {e.potencial && (
                      <span className="mt-1.5 inline-block text-[11px] text-slate-500">Potencial {e.potencial}</span>
                    )}
                  </Link>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
