import { getActor } from "@/lib/auth/guards"
import { can } from "@/lib/domain/roles"
import { listOwners } from "@/lib/data/high-school-queries"
import {
  listGoals,
  listCommercialCycles,
  listSupervestCycles,
  aderenciaDoConsultor,
  realizadoDaMeta,
} from "@/lib/data/goals-queries"
import { createClient } from "@/lib/supabase/server"
import { calcularProgresso, inicioSemanaComercial, fimSemanaComercial } from "@/lib/domain/goals"
import { BackfillControl } from "@/components/goals/backfill-control"
import {
  MetasClient,
  type MetaView,
  type ConsultorView,
  type OwnerView,
  type CicloOption,
  type ExcecaoView,
} from "@/components/goals/metas-client"

export const dynamic = "force-dynamic"

export default async function CentralDeMetasPage() {
  const actor = await getActor()
  const podeEscrever = actor ? can(actor.role, "goals.write") : false
  const podeBackfill = actor?.role === "gerente" || actor?.role === "supervisor"

  const [metasRaw, owners, ciclosComerciais, ciclosSupervest] = await Promise.all([
    listGoals(),
    listOwners(),
    listCommercialCycles(),
    listSupervestCycles(),
  ])

  // Realizado derivado por meta (nunca armazenado) → view com progresso.
  const metas: MetaView[] = await Promise.all(
    metasRaw.map(async (m) => {
      const realizado = await realizadoDaMeta(m)
      const prog = calcularProgresso(m.targetValue, realizado)
      return {
        id: m.id,
        goalType: m.goalType,
        goalTypeLabel: m.goalTypeLabel,
        unit: m.unit,
        scopeType: m.scopeType,
        teamType: m.teamType,
        userId: m.userId,
        userName: m.userName,
        targetValue: m.targetValue,
        realizado,
        atingimentoPct: prog.atingimentoPct,
        faltante: prog.faltante,
        startAt: m.startAt,
        endAt: m.endAt,
        status: m.status,
        notes: m.notes,
        supervestCycleId: m.supervestCycleId,
        commercialCycleId: m.commercialCycleId,
      }
    }),
  )

  // Aderência de ações semanais B2B, por consultor — janela das últimas 12 semanas.
  const metasB2b = metasRaw.filter((m) => m.goalType === "b2b_weekly_actions")
  const hoje = new Date()
  const inicioJanela = new Date(hoje)
  inicioJanela.setDate(inicioJanela.getDate() - 7 * 12)
  const de = inicioSemanaComercial(inicioJanela)
  const ate = fimSemanaComercial(inicioSemanaComercial(hoje))

  const consultoresB2b = owners.filter((o) => o.role === "consultor_b2b" || o.role === "supervisor")
  const consultores: ConsultorView[] = await Promise.all(
    consultoresB2b.map(async (o) => {
      const ad = await aderenciaDoConsultor(o.id, o.nome, de, ate, metasB2b)
      return {
        userId: o.id,
        userName: o.nome,
        aderenciaPct: ad.aderenciaPct,
        semanasAtingidas: ad.semanasAtingidas,
        semanasAplicaveis: ad.semanasAplicaveis,
        semanaCorrente: ad.semanaCorrente,
      }
    }),
  )

  // Exceções de semana registradas.
  const supabase = await createClient()
  const { data: excData } = await supabase
    .from("goal_week_exceptions")
    .select("id, user_id, week_start, reason, profiles:profiles!goal_week_exceptions_user_id_fkey(full_name)")
    .order("week_start", { ascending: false })
    .limit(100)
  const excecoes: ExcecaoView[] = (excData ?? []).map((e: any) => ({
    id: e.id,
    userId: e.user_id,
    userName: e.profiles?.full_name ?? null,
    weekStart: e.week_start,
    reason: e.reason,
  }))

  const ownersView: OwnerView[] = owners.map((o) => ({ id: o.id, nome: o.nome, role: o.role }))
  const ccOpt: CicloOption[] = ciclosComerciais.map((c) => ({ id: c.id, name: c.name }))
  const svOpt: CicloOption[] = ciclosSupervest.map((c) => ({ id: c.id, name: c.name }))

  return (
    <>
      {podeBackfill ? (
        <div className="mx-auto w-full max-w-6xl px-4 pt-4">
          <BackfillControl />
        </div>
      ) : null}
      <MetasClient
        metas={metas}
        consultores={consultores}
        owners={ownersView}
        ciclosComerciais={ccOpt}
        ciclosSupervest={svOpt}
        excecoes={excecoes}
        podeEscrever={podeEscrever}
      />
    </>
  )
}
