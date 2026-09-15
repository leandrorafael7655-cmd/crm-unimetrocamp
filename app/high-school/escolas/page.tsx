import Link from "next/link"
import { getActor } from "@/lib/auth/guards"
import { can } from "@/lib/domain/roles"
import { listSchools, listOwners } from "@/lib/data/high-school-queries"
import {
  CLASSIFICACOES_HS,
  CORES_CLASSIFICACAO_HS,
  CORES_ETAPA_HS,
  TODAS_ETAPAS_HS,
} from "@/lib/domain/high-school"
import { PageHeader, Card, Chip, EmptyState, Stat } from "@/components/high-school/hs-ui"
import { EscolaForm } from "@/components/high-school/escola-form"

export const dynamic = "force-dynamic"

export default async function EscolasPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; etapa?: string; classificacao?: string }>
}) {
  const sp = await searchParams
  const actor = await getActor()
  const podeEscrever = actor ? can(actor.role, "hs.write") : false
  const filtroAtivo = Boolean(sp.busca || sp.etapa || sp.classificacao)

  const [escolasBase, owners] = await Promise.all([
    listSchools({ busca: sp.busca, etapa: sp.etapa }),
    listOwners(),
  ])
  const escolas = sp.classificacao
    ? escolasBase.filter((e) => e.classificacao === sp.classificacao)
    : escolasBase
  const nomePorId = new Map(owners.map((o) => [o.id, o.nome]))
  const totaisClassificacao = Object.fromEntries(
    CLASSIFICACOES_HS.map((classificacao) => [
      classificacao,
      escolasBase.filter((e) => e.classificacao === classificacao).length,
    ]),
  ) as Record<(typeof CLASSIFICACOES_HS)[number], number>

  return (
    <>
      <PageHeader
        titulo="Escolas"
        descricao={`${escolas.length} escola(s) encontrada(s)`}
        acao={podeEscrever ? <EscolaForm owners={owners} /> : undefined}
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat rotulo="Ouro" valor={totaisClassificacao.Ouro} detalhe="escolas prioritárias" destaque />
        <Stat rotulo="Prata" valor={totaisClassificacao.Prata} detalhe="relacionamento relevante" />
        <Stat rotulo="Bronze" valor={totaisClassificacao.Bronze} detalhe="em desenvolvimento" />
      </div>

      <form className="mb-4 flex flex-wrap items-center gap-2" action="/high-school/escolas">
        <input
          name="busca"
          defaultValue={sp.busca}
          placeholder="Buscar por nome…"
          className="min-w-[220px] flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <select
          name="etapa"
          defaultValue={sp.etapa ?? ""}
          className="min-w-[210px] rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand"
        >
          <option value="">Todas as etapas</option>
          {TODAS_ETAPAS_HS.map((etapa) => (
            <option key={etapa} value={etapa}>{etapa}</option>
          ))}
        </select>
        <select
          name="classificacao"
          defaultValue={sp.classificacao ?? ""}
          className="min-w-[170px] rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand"
        >
          <option value="">Todas as classificações</option>
          {CLASSIFICACOES_HS.map((classificacao) => (
            <option key={classificacao} value={classificacao}>{classificacao}</option>
          ))}
        </select>
        <button className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:opacity-90">
          Filtrar
        </button>
        {filtroAtivo && (
          <Link
            href="/high-school/escolas"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
          >
            Limpar
          </Link>
        )}
      </form>

      {escolas.length === 0 ? (
        <EmptyState
          titulo={filtroAtivo ? "Nenhuma escola encontrada" : "Nenhuma escola cadastrada"}
          descricao={
            filtroAtivo
              ? "Tente ajustar a busca, a etapa ou a classificação."
              : podeEscrever
                ? "Cadastre a primeira escola — basta nome e cidade; CNPJ e INEP são opcionais."
                : "Ainda não há escolas cadastradas."
          }
          acao={!filtroAtivo && podeEscrever ? <EscolaForm owners={owners} /> : undefined}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 font-medium">Escola</th>
                  <th className="px-4 py-2.5 font-medium">Classificação</th>
                  <th className="px-4 py-2.5 font-medium">Rede</th>
                  <th className="px-4 py-2.5 font-medium">Cidade</th>
                  <th className="px-4 py-2.5 font-medium">Etapa</th>
                  <th className="px-4 py-2.5 font-medium">Responsável</th>
                </tr>
              </thead>
              <tbody>
                {escolas.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <Link href={`/high-school/escolas/${e.id}`} className="font-medium text-slate-800 hover:text-brand">
                        {e.nome}
                      </Link>
                      {e.potencial && <span className="ml-2 text-xs text-slate-400">· potencial {e.potencial}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {e.classificacao ? (
                        <Chip className={CORES_CLASSIFICACAO_HS[e.classificacao]}>{e.classificacao}</Chip>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{e.rede}</td>
                    <td className="px-4 py-2.5 text-slate-600">{e.cidade || "—"}</td>
                    <td className="px-4 py-2.5">
                      <Chip className={CORES_ETAPA_HS[e.etapa]}>{e.etapa}</Chip>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {e.primaryOwnerId ? nomePorId.get(e.primaryOwnerId) ?? "—" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  )
}
