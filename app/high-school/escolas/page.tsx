import Link from "next/link"
import { getActor } from "@/lib/auth/guards"
import { can } from "@/lib/domain/roles"
import { listSchools, listOwners } from "@/lib/data/high-school-queries"
import { CORES_ETAPA_HS } from "@/lib/domain/high-school"
import { PageHeader, Card, Chip, EmptyState } from "@/components/high-school/hs-ui"
import { EscolaForm } from "@/components/high-school/escola-form"

export const dynamic = "force-dynamic"

export default async function EscolasPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; etapa?: string }>
}) {
  const sp = await searchParams
  const actor = await getActor()
  const podeEscrever = actor ? can(actor.role, "hs.write") : false

  const [escolas, owners] = await Promise.all([
    listSchools({ busca: sp.busca, etapa: sp.etapa }),
    listOwners(),
  ])
  const nomePorId = new Map(owners.map((o) => [o.id, o.nome]))

  return (
    <>
      <PageHeader
        titulo="Escolas"
        descricao={`${escolas.length} escola(s) no relacionamento High School`}
        acao={podeEscrever ? <EscolaForm owners={owners} /> : undefined}
      />

      <form className="mb-4 flex flex-wrap gap-2" action="/high-school/escolas">
        <input
          name="busca"
          defaultValue={sp.busca}
          placeholder="Buscar por nome…"
          className="min-w-[200px] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
          Buscar
        </button>
      </form>

      {escolas.length === 0 ? (
        <EmptyState
          titulo="Nenhuma escola encontrada"
          descricao={
            podeEscrever
              ? "Cadastre a primeira escola — basta nome e cidade; CNPJ e INEP são opcionais."
              : "Ainda não há escolas cadastradas."
          }
          acao={podeEscrever ? <EscolaForm owners={owners} /> : undefined}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 font-medium">Escola</th>
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
