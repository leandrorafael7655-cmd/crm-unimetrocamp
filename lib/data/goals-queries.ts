import { requireActor } from "@/lib/auth/guards"
import { can } from "@/lib/domain/roles"
import { saoPauloToday } from "@/lib/domain/school-agenda"
import "server-only"
import { createClient } from "@/lib/supabase/server"
import { profileDisplayName } from "@/lib/domain/user-display"
import { readAllRows } from "./pagination"
import {
  inicioSemanaComercial,
  fimSemanaComercial,
  semanasNoIntervalo,
  isSemanaCorrente,
  calcularAderencia,
  semanaAtingida,
  apurarSupervest,
  type SemanaAderencia,
} from "@/lib/domain/goals"

/* ─────────────────────────────  tipos de leitura  ───────────────────────── */

export interface CicloComercial {
  id: string
  name: string
  startAt: string
  endAt: string
  status: string
}
export interface CicloSupervest {
  id: string
  name: string
  edition: string | null
  academicCycle: string | null
  campaignStartAt: string | null
  campaignEndAt: string | null
  eventAt: string | null
  registrationsTarget: number
  highSchoolActionsTarget: number
  status: string
  notes: string | null
  isActive: boolean
  captureAcademicYear: number | null
}
export interface SnapshotSupervest {
  id: string
  cycleId: string
  snapshotDate: string
  officialRegistrations: number
  notes: string | null
}
export interface Meta {
  id: string
  goalType: string
  goalTypeLabel: string
  unit: string
  scopeType: "geral" | "individual"
  teamType: string | null
  userId: string | null
  userName: string | null
  commercialCycleId: string | null
  supervestCycleId: string | null
  targetValue: number
  startAt: string
  endAt: string
  status: string
  notes: string | null
}

/* ─────────────────────────────  ciclos  ───────────────────────── */

export async function listCommercialCycles(): Promise<CicloComercial[]> {
  const supabase = await createClient()
  const { error } = await supabase.rpc("b2b_ensure_cycles")
  if (error) throw new Error(error.message)
  const { data } = await supabase
    .from("commercial_cycles")
    .select("id,name,start_at,end_at,status")
    .order("start_at", { ascending: false })
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    startAt: c.start_at,
    endAt: c.end_at,
    status: c.status,
  }))
}

export async function listSupervestCycles(): Promise<CicloSupervest[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("supervest_cycles")
    .select("*")
    .order("created_at", { ascending: false })
  return (data ?? []).map(mapSupervestCycle)
}

export async function getSupervestCycle(id: string): Promise<CicloSupervest | null> {
  const supabase = await createClient()
  const { data } = await supabase.from("supervest_cycles").select("*").eq("id", id).maybeSingle()
  return data ? mapSupervestCycle(data) : null
}

function mapSupervestCycle(c: any): CicloSupervest {
  return {
    id: c.id,
    name: c.name,
    edition: c.edition,
    academicCycle: c.academic_cycle,
    campaignStartAt: c.campaign_start_at,
    campaignEndAt: c.campaign_end_at,
    eventAt: c.event_at,
    registrationsTarget: c.registrations_target ?? 0,
    highSchoolActionsTarget: c.high_school_actions_target ?? 0,
    status: c.status,
    notes: c.notes,
    isActive: Boolean(c.is_active),
    captureAcademicYear: c.capture_academic_year ?? null,
  }
}

export async function listSupervestSnapshots(cycleId: string): Promise<SnapshotSupervest[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("supervest_snapshots")
    .select("id,cycle_id,snapshot_date,official_registrations,notes")
    .eq("cycle_id", cycleId)
    .order("snapshot_date", { ascending: true })
  return (data ?? []).map((s) => ({
    id: s.id,
    cycleId: s.cycle_id,
    snapshotDate: s.snapshot_date,
    officialRegistrations: s.official_registrations ?? 0,
    notes: s.notes,
  }))
}

/* ─────────────────────────────  metas  ───────────────────────── */

export async function listGoals(): Promise<Meta[]> {
  const actor = await requireActor()
  const supabase = await createClient()
  let query = supabase
    .from("goals")
    .select(
      "id,goal_type,scope_type,team_type,user_id,commercial_cycle_id,supervest_cycle_id,target_value,start_at,end_at,status,notes," +
        "goal_types(label,unit),profiles!goals_user_id_fkey(full_name,consultant_tag)",
    )
    .order("created_at", { ascending: false })
  if (!can(actor.role,"goals.read.all")) query = query.eq("scope_type","individual").eq("user_id",actor.id)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map((g: any) => ({
    id: g.id,
    goalType: g.goal_type,
    goalTypeLabel: g.goal_types?.label ?? g.goal_type,
    unit: g.goal_types?.unit ?? "un",
    scopeType: g.scope_type,
    teamType: g.team_type,
    userId: g.user_id,
    userName: g.profiles ? profileDisplayName(g.profiles, "") || null : null,
    commercialCycleId: g.commercial_cycle_id,
    supervestCycleId: g.supervest_cycle_id,
    targetValue: Number(g.target_value),
    startAt: g.start_at,
    endAt: g.end_at,
    status: g.status,
    notes: g.notes,
  }))
}

export interface GoalHistoryRow {
  id: string
  fieldChanged: string
  previousValue: string | null
  newValue: string | null
  reason: string | null
  changedAt: string
  changedByName: string | null
}

export async function listGoalHistory(goalId: string): Promise<GoalHistoryRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("goal_history")
    .select("id,field_changed,previous_value,new_value,reason,changed_at,profiles(full_name,consultant_tag)")
    .eq("goal_id", goalId)
    .order("changed_at", { ascending: false })
  return (data ?? []).map((h: any) => ({
    id: h.id,
    fieldChanged: h.field_changed,
    previousValue: h.previous_value,
    newValue: h.new_value,
    reason: h.reason,
    changedAt: h.changed_at,
    changedByName: h.profiles ? profileDisplayName(h.profiles, "") || null : null,
  }))
}

/* ──────────────────  meta semanal B2B vigente + aderência  ────────────── */

/**
 * Resolve a meta semanal (ações B2B) vigente para um consultor numa semana:
 * exceção individual não conta como meta (é ausência); prioriza meta individual
 * ativa que cobre a semana, senão a meta geral B2B que cobre a semana, senão 0.
 */
export function resolverMetaSemanal(
  weekStart: string,
  goalsB2b: { scopeType: string; userId: string | null; targetValue: number; startAt: string; endAt: string; status: string }[],
  userId: string,
): number {
  const cobre = (g: { startAt: string; endAt: string; status: string }) =>
    g.status === "ativa" && g.startAt <= weekStart && g.endAt >= weekStart
  const individual = goalsB2b.find((g) => g.scopeType === "individual" && g.userId === userId && cobre(g))
  if (individual) return individual.targetValue
  const geral = goalsB2b.find((g) => g.scopeType === "geral" && cobre(g))
  return geral ? geral.targetValue : 0
}

/** Conta ações que contam para a meta semanal de um consultor numa janela. */
export async function contarAcoesSemana(
  userId: string,
  weekStart: string,
  weekEnd: string,
): Promise<{ completed: number; distinctCompanies: number }> {
  const supabase = await createClient()
  const rows = await readAllRows<{company_id:string}>((from,to) => supabase
    .from("activities")
    .select("company_id")
    .eq("primary_owner_id", userId)
    .eq("status", "realizada")
    .eq("conta_meta_semanal", true)
    .not("company_id", "is", null)
    .gte("data", weekStart)
    .lte("data", weekEnd)
    .order("id").range(from,to))
  const empresas = new Set(rows.map((r) => r.company_id))
  return { completed: rows.length, distinctCompanies: empresas.size }
}

export interface AderenciaConsultor {
  userId: string
  userName: string
  semanas: SemanaAderencia[]
  semanasAplicaveis: number
  semanasAtingidas: number
  aderenciaPct: number
  semanaCorrente: { completed: number; target: number; achieved: boolean } | null
}

/**
 * Estratégia híbrida: semanas fechadas vêm de weekly_action_snapshots (com
 * applied_target CONGELADO); a semana corrente é calculada ao vivo.
 */
export async function aderenciaDoConsultor(
  userId: string,
  userName: string,
  de: string,
  ate: string,
  goalsB2b: Parameters<typeof resolverMetaSemanal>[1],
): Promise<AderenciaConsultor> {
  const supabase = await createClient()
  const semanasRange = semanasNoIntervalo(de, ate)

  const [snapshotResult,exceptionResult,activities] = await Promise.all([
    supabase.from("weekly_action_snapshots")
      .select("week_start,applied_target,completed_actions,achieved,applicable,exception_reason")
      .eq("user_id",userId).gte("week_start",semanasRange[0] ?? de).lte("week_start",ate),
    supabase.from("goal_week_exceptions").select("week_start,reason")
      .eq("user_id",userId).gte("week_start",semanasRange[0] ?? de).lte("week_start",ate),
    readAllRows<{id:string;data:string}>((from,to)=>supabase.from("activities").select("id,data")
      .eq("primary_owner_id",userId).eq("status","realizada").eq("conta_meta_semanal",true)
      .not("company_id","is",null).gte("data",semanasRange[0] ?? de).lte("data",ate).order("id").range(from,to)),
  ])
  if (snapshotResult.error || exceptionResult.error) throw new Error("Não foi possível calcular a aderência: dados indisponíveis.")
  const snaps=snapshotResult.data,exc=exceptionResult.data
  const snapByWeek = new Map((snaps ?? []).map((s) => [s.week_start, s]))
  const excByWeek = new Map((exc ?? []).map((e) => [e.week_start, e]))
  const completedByWeek=new Map<string,number>()
  for(const row of activities) {
    const week=inicioSemanaComercial(new Date(`${row.data}T12:00:00-03:00`))
    completedByWeek.set(week,(completedByWeek.get(week) ?? 0)+1)
  }

  const semanas: SemanaAderencia[] = []
  let corrente: AderenciaConsultor["semanaCorrente"] = null

  for (const ws of semanasRange) {
    const excecao = excByWeek.get(ws)
    if (isSemanaCorrente(ws)) {
      const target = resolverMetaSemanal(ws, goalsB2b, userId)
      const completed = completedByWeek.get(ws) ?? 0
      corrente = { completed, target, achieved: semanaAtingida(completed, target) }
      // semana corrente não entra na aderência histórica (ainda aberta)
      continue
    }
    const snap = snapByWeek.get(ws)
    if (snap) {
      semanas.push({
        weekStart: ws,
        appliedTarget: snap.applied_target,
        completedActions: snap.completed_actions,
        achieved: snap.achieved,
        applicable: snap.applicable && !excecao,
        exceptionReason: excecao?.reason ?? snap.exception_reason,
      })
    } else {
      // sem snapshot (semana passada não fechada): calcula ao vivo como fallback
      const target = resolverMetaSemanal(ws, goalsB2b, userId)
      const completed = completedByWeek.get(ws) ?? 0
      semanas.push({
        weekStart: ws,
        appliedTarget: target,
        completedActions: completed,
        achieved: semanaAtingida(completed, target),
        applicable: !excecao,
        exceptionReason: excecao?.reason ?? null,
      })
    }
  }

  const res = calcularAderencia(semanas)
  return {
    userId,
    userName,
    semanas,
    semanasAplicaveis: res.semanasAplicaveis,
    semanasAtingidas: res.semanasAtingidas,
    aderenciaPct: res.aderenciaPct,
    semanaCorrente: corrente,
  }
}

export interface MetaComRealizado extends Meta {
  realizado: number | null
}

/**
 * Metas ATIVAS de escopo geral para os tipos informados, já com realizado
 * derivado. Usada nos cards de dashboard. Filtra pelo período vigente (hoje
 * dentro de start/end) para não exibir metas encerradas.
 */
export async function metasAtivasComRealizado(goalTypes: string[]): Promise<MetaComRealizado[]> {
  const todas = await listGoals()
  const hoje = saoPauloToday()
  const ativas = todas.filter(
    (m) =>
      goalTypes.includes(m.goalType) &&
      m.status === "ativa" &&
      m.scopeType === "geral" &&
      m.startAt <= hoje &&
      m.endAt >= hoje,
  )
  return Promise.all(
    ativas.map(async (m) => ({ ...m, realizado: await realizadoDaMeta(m) })),
  )
}

/* ──────────────────────  realizado derivado por meta  ────────────────────
   O realizado NUNCA é armazenado na meta — é sempre calculado a partir das
   transações no período de vigência. Alterar a meta não afeta o realizado. */

async function somarGradeResults(
  supabase: Awaited<ReturnType<typeof createClient>>,
  campo: "leads" | "supervest_registrations",
  startAt: string | null,
  endAt: string | null,
  ownerId: string | null,
  supervestCycleId: string | null,
): Promise<number | null> {
  let q = supabase
    .from("school_actions")
    .select("id")
    .eq("status", "realizada")
  if (startAt) q=q.gte("action_date",startAt)
  if (endAt) q=q.lte("action_date",endAt)
  if (ownerId) q = q.eq("primary_owner_id", ownerId)
  if (supervestCycleId) q = q.eq("supervest_cycle_id", supervestCycleId)
  try {
    const acoes=await readAllRows<{id:string}>((from,to)=>q.order("id").range(from,to))
    let total=0
    // Bound URL size as well as PostgREST's row cap; one action may have multiple grade rows.
    for(let offset=0;offset<acoes.length;offset+=100) {
      const ids=acoes.slice(offset,offset+100).map(a=>a.id)
      const results=await readAllRows<Record<string,number>>((from,to)=>supabase.from("school_action_grade_results")
        .select(campo).in("school_action_id",ids).order("id").range(from,to))
      total+=results.reduce((sum,row)=>sum+(row[campo] ?? 0),0)
    }
    return total
  } catch { return null }
}

/** Realizado derivado de uma meta, conforme seu tipo e escopo. */
export async function realizadoDaMeta(meta: Meta): Promise<number | null> {
  const actor = await requireActor()
  if (!can(actor.role,"goals.read.all") && (meta.scopeType!=="individual" || meta.userId!==actor.id)) return null
  const supabase = await createClient()
  const owner = meta.scopeType === "individual" ? meta.userId : null

  switch (meta.goalType) {
    case "high_school_leads":
      return somarGradeResults(supabase, "leads", meta.startAt, meta.endAt, owner, null)
    case "supervest_registrations":
      return somarGradeResults(
        supabase,
        "supervest_registrations",
        meta.startAt,
        meta.endAt,
        owner,
        meta.supervestCycleId,
      )
    case "high_school_actions": {
      let q = supabase
        .from("school_actions")
        .select("id", { count: "exact", head: true })
        .eq("status", "realizada")
        .gte("action_date", meta.startAt)
        .lte("action_date", meta.endAt)
      if (owner) q = q.eq("primary_owner_id", owner)
      const { count,error } = await q
      return error ? null : count ?? 0
    }
    case "b2b_weekly_actions": {
      let q = supabase
        .from("activities")
        .select("id", { count: "exact", head: true })
        .eq("status", "realizada")
        .eq("conta_meta_semanal", true)
        .not("company_id", "is", null)
        .gte("data", meta.startAt)
        .lte("data", meta.endAt)
      if (owner) q = q.eq("primary_owner_id", owner)
      const { count,error } = await q
      return error ? null : count ?? 0
    }
    case "b2b_supervest_registrations":
      // Missing attribution is not a measured zero.
      return null
    default:
      return null
  }
}

/* ──────────────────  apuração anti-dupla-contagem SuperVest  ───────────── */

export async function apuracaoSupervest(cycleId: string) {
  const supabase = await createClient()

  // inscrição oficial = maior snapshot (leitura mais recente) do ciclo
  const { data: snaps,error: snapshotError } = await supabase
    .from("supervest_snapshots")
    .select("official_registrations,snapshot_date")
    .eq("cycle_id", cycleId)
    .order("snapshot_date", { ascending: false })
    .limit(1)
  const oficial = snapshotError ? null : snaps?.[0]?.official_registrations ?? null

  const hs=await somarGradeResults(supabase,"supervest_registrations",null,null,null,cycleId)

  // Missing B2B attribution also prevents calculating a reliable "other channels" residual.
  const b2b = null

  return apurarSupervest(oficial, hs, b2b)
}
