import Link from "next/link"
import { listSchools, listActions, listGradeLevels, listEstimatesByEscola } from "@/lib/data/high-school-queries"
import { metasAtivasComRealizado } from "@/lib/data/goals-queries"
import { GoalCard } from "@/components/goals/goal-cards"
import { PageHeader, Card, Stat, Chip, SectionTitle, EmptyState } from "@/components/high-school/hs-ui"
import {
  construirFilaHS,
  ETAPAS_HS_ATIVAS,
  CORES_ETAPA_HS,
  type NivelHS,
} from "@/lib/domain/high-school"

export const dynamic = "force-dynamic"

const CORES_NIVEL: Record<NivelHS, string> = {
  critico: "border-rose-200 bg-rose-50 text-rose-700",
  hoje: "border-amber-200 bg-amber-50 text-amber-800",
  atencao: "border-slate-200 bg-slate-50 text-slate-600",
}
const ROTULO_NIVEL: Record<NivelHS, string> = {
  critico: "Crítico",
  hoje: "Para hoje",
  atencao: "Atenção",
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10)
}

export default async function HighSchoolDashboard() {
  const hoje = hojeISO()
  const [escolas, acoes, grades, seriesPorEscola, metasHS] = await Promise.all([
    listSchools(),
    listActions(),
    listGradeLevels(),
    listEstimatesByEscola(),
    metasAtivasComRealizado([
      "high_school_leads",
      "supervest_registrations",
      "high_school_actions",
    ]),
  ])

  const seriesElegiveis = grades.filter((g) => g.supervestEligible).map((g) => g.code)
  const fila = construirFilaHS({ escolas, acoes, seriesElegiveis, seriesPorEscola, hoje })

  const ativas = escolas.filter((e) => ETAPAS_HS_ATIVAS.includes(e.etapa)).length
  const estrategicas = escolas.filter((e) => e.classificacao === "Estratégica").length
  const acoesRealizadas = acoes.filter((a) => a.status === "realizada")
  const totalLeads = acoesRealizadas.reduce(
    (s, a) => s + a.resultados.reduce((x, r) => x + (r.leads || 0), 0),
    0,
  )
  const totalInscricoes = acoesRealizadas.reduce(
    (s, a) => s + a.resultados.reduce((x, r) => x + (r.inscricoesSupervest || 0), 0),
    0,
  )
  const conversao = totalLeads > 0 ? Math.round((totalInscricoes / totalLeads) * 100) : 0

  const proximas = acoes
    .filter((a) => a.data >= hoje && a.status !== "cancelada")
    .sort((a, b) => a.data.localeCompare(b.data))
    .slice(0, 6)

  return (
    <>
      <PageHeader
        titulo="Painel High School"
        descricao="Relacionamento com escolas, ações de campo e captação SuperVestibular"
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat rotulo="Escolas" valor={escolas.length} detalhe={`${estrategicas} estratégica(s)`} />
        <Stat rotulo="Em relacionamento" valor={ativas} detalhe="ativas + estratégicas" />
        <Stat rotulo="Leads (ações realizadas)" valor={totalLeads} />
        <Stat
          rotulo="Inscrições SuperVest"
          valor={totalInscricoes}
          detalhe={`${conversao}% de conversão`}
          destaque
        />
      </div>

      {metasHS.length > 0 && (
        <section className="mb-6">
          <SectionTitle acao={<Link href="/gestao/metas" className="text-xs text-brand hover:underline">Central de Metas</Link>}>
            Metas do ciclo
          </SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {metasHS.map((m) => (
              <GoalCard
                key={m.id}
                titulo={m.goalTypeLabel}
                alvo={m.targetValue}
                atual={m.realizado}
                unidade={m.unit}
                detalhe={`Vigência: ${m.startAt.split("-").reverse().join("/")} — ${m.endAt.split("-").reverse().join("/")}`}
              />
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* fila de prioridade */}
        <section className="lg:col-span-2">
          <SectionTitle acao={<span className="text-xs text-slate-400">{fila.length} item(ns)</span>}>
            Fila de prioridade
          </SectionTitle>
          {fila.length === 0 ? (
            <EmptyState
              titulo="Nada urgente por aqui"
              descricao="Nenhuma escola exige ação imediata. Cadastre escolas ou agende ações para alimentar a fila."
            />
          ) : (
            <div className="space-y-2">
              {fila.slice(0, 12).map(({ escola, motivos, nivel }) => (
                <Link key={escola.id} href={`/high-school/escolas/${escola.id}`}>
                  <Card className="flex flex-wrap items-start justify-between gap-3 p-3.5 transition hover:border-brand/40">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-slate-800">{escola.nome}</p>
                        <Chip className={CORES_ETAPA_HS[escola.etapa]}>{escola.etapa}</Chip>
                      </div>
                      <ul className="mt-1 space-y-0.5">
                        {motivos.map((m, i) => (
                          <li key={i} className="text-xs text-slate-500">
                            • {m}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Chip className={CORES_NIVEL[nivel]}>{ROTULO_NIVEL[nivel]}</Chip>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* próximas ações */}
        <section>
          <SectionTitle acao={<Link href="/high-school/agenda" className="text-xs text-brand hover:underline">Ver agenda</Link>}>
            Próximas ações
          </SectionTitle>
          {proximas.length === 0 ? (
            <EmptyState titulo="Sem ações agendadas" />
          ) : (
            <div className="space-y-2">
              {proximas.map((a) => (
                <Link key={a.id} href={`/high-school/escolas/${a.escolaId}`}>
                  <Card className="p-3 transition hover:border-brand/40">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-slate-800">{a.escolaNome ?? "Escola"}</p>
                      <span className="shrink-0 text-xs text-slate-400">
                        {a.data.split("-").reverse().join("/")}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 capitalize">
                      {a.tipo} · {a.status}
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  )
}
