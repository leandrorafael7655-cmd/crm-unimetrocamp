import { redirect } from "next/navigation"
import Link from "next/link"
import { getActor } from "@/lib/auth/guards"
import { rotuloRole } from "@/lib/domain/roles"
import { escopoDashboard } from "@/lib/domain/dashboard-scope"
import { resumoB2B, resumoMapa } from "@/lib/data/dashboard-queries"
import { garantirFechamentoEmDia } from "@/lib/data/weekly-close"
import {
  listSchools,
  listActions,
  listGradeLevels,
  listEstimatesByEscola,
} from "@/lib/data/high-school-queries"
import {
  metasAtivasComRealizado,
  listSupervestCycles,
  apuracaoSupervest,
  type CicloSupervest,
} from "@/lib/data/goals-queries"
import { construirFilaHS, ETAPAS_HS_ATIVAS } from "@/lib/domain/high-school"
import { GoalCard } from "@/components/goals/goal-cards"
import { BlocoModulo, Kpi, KpiGrid, BlocoErro, BlocoVazio } from "@/components/dashboard/dashboard-ui"
import { Building2, GraduationCap, Target, Map as MapIcon, Sparkles, Settings } from "lucide-react"

export const dynamic = "force-dynamic"

const brData = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "—")

function hojeISO() {
  return new Date().toISOString().slice(0, 10)
}

/* ── carregadores compostos que reusam o domínio já existente ── */

async function carregarHS(hoje: string) {
  const [escolas, acoes, grades, seriesPorEscola] = await Promise.all([
    listSchools(),
    listActions(),
    listGradeLevels(),
    listEstimatesByEscola(),
  ])
  const seriesElegiveis = grades.filter((g) => g.supervestEligible).map((g) => g.code)
  const fila = construirFilaHS({ escolas, acoes, seriesElegiveis, seriesPorEscola, hoje })
  return {
    total: escolas.length,
    ativas: escolas.filter((e) => ETAPAS_HS_ATIVAS.includes(e.etapa)).length,
    criticas: fila.filter((i) => i.nivel === "critico").length,
    paraHoje: fila.filter((i) => i.nivel === "hoje").length,
    topFila: fila.slice(0, 4),
  }
}

async function carregarSupervest() {
  const ciclos = await listSupervestCycles()
  if (ciclos.length === 0) return { ciclo: null as CicloSupervest | null, apur: null }
  // Prioriza um ciclo em andamento; senão, o mais recente (a lista já vem desc).
  const emAndamento = ciclos.find((c) => c.status !== "encerrado" && c.status !== "cancelado")
  const ciclo = emAndamento ?? ciclos[0]
  const apur = await apuracaoSupervest(ciclo.id)
  return { ciclo, apur }
}

export default async function DashboardGeral() {
  const actor = await getActor()
  if (!actor) redirect("/auth/login")

  const role = actor.role
  const hoje = hojeISO()

  // Auto-recuperação: se o cron semanal não rodou, fecha a lacuna agora.
  // Idempotente, auto-gated e à prova de erro (nunca quebra o render).
  await garantirFechamentoEmDia()

  const { verB2B, soCarteiraPropria, verHS, verSV, verMetas, verMapa } = escopoDashboard(role)

  const [b2bR, hsR, svR, metasR, mapaR] = await Promise.allSettled([
    verB2B ? resumoB2B(soCarteiraPropria ? actor.id : null) : Promise.resolve(null),
    verHS ? carregarHS(hoje) : Promise.resolve(null),
    verSV ? carregarSupervest() : Promise.resolve(null),
    verMetas
      ? metasAtivasComRealizado([
          "b2b_weekly_actions",
          "b2b_supervest_registrations",
          "high_school_leads",
          "high_school_actions",
          "supervest_registrations",
        ])
      : Promise.resolve(null),
    verMapa ? resumoMapa() : Promise.resolve(null),
  ])

  const links = [
    verB2B && { href: "/", rotulo: "CRM B2B", Icone: Building2 },
    verHS && { href: "/high-school", rotulo: "High School", Icone: GraduationCap },
    verSV && { href: "/supervest", rotulo: "SuperVestibular", Icone: Sparkles },
    verMetas && { href: "/gestao/metas", rotulo: "Central de Metas", Icone: Target },
    verMapa && { href: "/mapa", rotulo: "Mapa", Icone: MapIcon },
    (role === "gerente" || role === "supervisor") && {
      href: "/gestao/configuracoes",
      rotulo: "Configurações",
      Icone: Settings,
    },
  ].filter(Boolean) as { href: string; rotulo: string; Icone: typeof Building2 }[]

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900">
      {/* cabeçalho da marca */}
      <header className="bg-brand-rail">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <div>
            <p className="text-lg font-semibold text-white text-balance">Painel Geral</p>
            <p className="text-xs text-brand-suave/70">UniMetrocamp Wyden · visão consolidada</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-white">{actor.full_name}</p>
            <span className="mt-0.5 inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-brand-suave">
              {rotuloRole(role)}
            </span>
          </div>
        </div>
        {/* atalhos de módulo */}
        <nav aria-label="Módulos" className="mx-auto max-w-[1200px] px-4 pb-3 sm:px-6">
          <ul className="flex flex-wrap gap-2">
            {links.map(({ href, rotulo, Icone }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-brand-suave transition hover:bg-white/10 hover:text-white"
                >
                  <Icone className="h-3.5 w-3.5" />
                  {rotulo}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* ── B2B ── */}
          {verB2B && (
            <BlocoModulo
              titulo="Comercial B2B"
              subtitulo={soCarteiraPropria ? "Sua carteira" : "Carteira geral"}
              href="/"
              hrefRotulo="Abrir CRM"
            >
              {b2bR.status === "rejected" ? (
                <BlocoErro mensagem={String((b2bR.reason as Error)?.message ?? "")} />
              ) : b2bR.value && b2bR.value.carteira === 0 ? (
                <BlocoVazio texto="Nenhuma empresa na carteira ainda." />
              ) : b2bR.value ? (
                <KpiGrid>
                  <Kpi rotulo="Carteira" valor={b2bR.value.carteira} tom="brand" />
                  <Kpi rotulo="Conveniadas" valor={b2bR.value.conveniadas} tom="ok" />
                  <Kpi
                    rotulo="Follow-up atrasado"
                    valor={b2bR.value.followupAtrasado}
                    tom={b2bR.value.followupAtrasado > 0 ? "critico" : "neutro"}
                  />
                  <Kpi rotulo="Sem próximo passo" valor={b2bR.value.semProximaAcao} tom="alerta" />
                  <Kpi
                    rotulo="Conveniada sem link"
                    valor={b2bR.value.conveniadaSemLink}
                    tom={b2bR.value.conveniadaSemLink > 0 ? "critico" : "neutro"}
                    detalhe="matrículas não atribuídas"
                  />
                </KpiGrid>
              ) : null}
            </BlocoModulo>
          )}

          {/* ── High School ── */}
          {verHS && (
            <BlocoModulo
              titulo="High School"
              subtitulo="Relacionamento com escolas"
              href="/high-school"
              hrefRotulo="Abrir módulo"
            >
              {hsR.status === "rejected" ? (
                <BlocoErro mensagem={String((hsR.reason as Error)?.message ?? "")} />
              ) : hsR.value && hsR.value.total === 0 ? (
                <BlocoVazio texto="Nenhuma escola cadastrada ainda." />
              ) : hsR.value ? (
                <>
                  <KpiGrid>
                    <Kpi rotulo="Escolas" valor={hsR.value.total} tom="brand" />
                    <Kpi rotulo="Em relacionamento" valor={hsR.value.ativas} tom="ok" />
                    <Kpi
                      rotulo="Fila crítica"
                      valor={hsR.value.criticas}
                      tom={hsR.value.criticas > 0 ? "critico" : "neutro"}
                    />
                  </KpiGrid>
                  {hsR.value.topFila.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {hsR.value.topFila.map((item) => (
                        <li key={item.escola.id}>
                          <Link
                            href={`/high-school/escolas/${item.escola.id}`}
                            className="flex items-center justify-between gap-2 rounded-md border border-slate-100 px-2.5 py-1.5 text-xs transition hover:border-slate-200 hover:bg-slate-50"
                          >
                            <span className="truncate font-medium text-slate-700">{item.escola.nome}</span>
                            <span
                              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                item.nivel === "critico"
                                  ? "bg-rose-50 text-rose-600"
                                  : item.nivel === "hoje"
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {item.motivos[0]}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : null}
            </BlocoModulo>
          )}

          {/* ── SuperVestibular ── */}
          {verSV && (
            <BlocoModulo
              titulo="SuperVestibular"
              subtitulo="Captação e inscrições"
              href="/supervest"
              hrefRotulo="Abrir módulo"
            >
              {svR.status === "rejected" ? (
                <BlocoErro mensagem={String((svR.reason as Error)?.message ?? "")} />
              ) : svR.value && svR.value.ciclo ? (
                <>
                  <p className="mb-3 text-xs text-slate-500">
                    Ciclo atual: <span className="font-medium text-slate-700">{svR.value.ciclo.name}</span>
                  </p>
                  <KpiGrid>
                    <Kpi rotulo="Meta inscrições" valor={svR.value.ciclo.registrationsTarget} />
                    <Kpi rotulo="Oficial" valor={svR.value.apur?.oficial ?? 0} tom="brand" />
                    <Kpi rotulo="Atribuídas HS" valor={svR.value.apur?.hsAtribuidas ?? 0} tom="ok" />
                  </KpiGrid>
                  <p className="mt-3 text-xs text-slate-500">
                    Outros canais:{" "}
                    <span
                      className={`font-semibold tabular-nums ${
                        svR.value.apur?.inconsistente ? "text-rose-600" : "text-slate-700"
                      }`}
                    >
                      {svR.value.apur?.outrosCanais ?? 0}
                    </span>
                    {svR.value.apur?.inconsistente && (
                      <span className="ml-1 text-rose-600">· atribuídas acima do oficial, revisar</span>
                    )}
                  </p>
                </>
              ) : svR.status === "fulfilled" ? (
                <BlocoVazio texto="Nenhum ciclo SuperVest cadastrado." />
              ) : null}
            </BlocoModulo>
          )}

          {/* ── Execução de campo / Metas ── */}
          {verMetas && (
            <BlocoModulo
              titulo="Execução de campo"
              subtitulo="Metas ativas do ciclo"
              href="/gestao/metas"
              hrefRotulo="Central de Metas"
            >
              {metasR.status === "rejected" ? (
                <BlocoErro mensagem={String((metasR.reason as Error)?.message ?? "")} />
              ) : metasR.value && metasR.value.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {metasR.value.slice(0, 4).map((m) => (
                    <GoalCard
                      key={m.id}
                      titulo={m.goalTypeLabel}
                      alvo={m.targetValue}
                      atual={m.realizado}
                      unidade={m.unit}
                      detalhe={`Vigência: ${brData(m.startAt)} — ${brData(m.endAt)}`}
                    />
                  ))}
                </div>
              ) : (
                <BlocoVazio texto="Nenhuma meta geral ativa no período." />
              )}
            </BlocoModulo>
          )}

          {/* ── Resumo do mapa ── */}
          {verMapa && (
            <BlocoModulo
              titulo="Cobertura no mapa"
              subtitulo="Geolocalização de empresas e escolas"
              href="/mapa"
              hrefRotulo="Abrir mapa"
            >
              {mapaR.status === "rejected" ? (
                <BlocoErro mensagem={String((mapaR.reason as Error)?.message ?? "")} />
              ) : mapaR.value ? (
                <KpiGrid>
                  <Kpi rotulo="Empresas no mapa" valor={mapaR.value.empresasGeo} tom="brand" />
                  <Kpi
                    rotulo="Empresas sem endereço"
                    valor={mapaR.value.empresasSemGeo}
                    tom={mapaR.value.empresasSemGeo > 0 ? "alerta" : "neutro"}
                  />
                  <Kpi rotulo="Escolas no mapa" valor={mapaR.value.escolasGeo} tom="ok" />
                  <Kpi
                    rotulo="Escolas sem endereço"
                    valor={mapaR.value.escolasSemGeo}
                    tom={mapaR.value.escolasSemGeo > 0 ? "alerta" : "neutro"}
                  />
                </KpiGrid>
              ) : null}
            </BlocoModulo>
          )}
        </div>
      </main>
    </div>
  )
}
