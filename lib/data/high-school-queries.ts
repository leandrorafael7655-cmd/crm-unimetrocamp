import "server-only"

/* ─────────────────────────  leituras High School  ─────────────────────────
   Funções de consulta usadas pelos Server Components das telas HS. Usam o
   cliente com a sessão do usuário (RLS aplicada): qualquer papel LÊ, mas só
   gerente/supervisor/high_school ESCREVEM (garantido no banco e nas actions). */

import { createClient } from "@/lib/supabase/server"
import { requireCan } from "@/lib/auth/guards"
import {
  type Escola,
  type ContatoEscola,
  type EstimativaSerie,
  type AcaoEscola,
  type GradeLevel,
  type ParticipanteAcao,
  type ResultadoSerie,
  mapEscolaRow,
  mapContatoRow,
  mapEstimativaRow,
  mapAcaoRow,
  mapGradeRow,
  mapResultadoRow,
} from "@/lib/domain/high-school"

export interface OwnerOption {
  id: string
  nome: string
  role: string
}

/** Séries de referência (ordenadas). */
export async function listGradeLevels(): Promise<GradeLevel[]> {
  await requireCan("hs.read")
  const supabase = await createClient()
  const { data } = await supabase
    .from("grade_levels")
    .select("code,label,sort_order,supervest_eligible,active")
    .order("sort_order", { ascending: true })
  return (data ?? []).map(mapGradeRow)
}

/** Usuários ativos que podem ser responsáveis/participantes de ações HS. */
export async function listOwners(): Promise<OwnerOption[]> {
  await requireCan("hs.read")
  const supabase = await createClient()
  const { data } = await supabase
    .from("profiles")
    .select("id,full_name,role,active")
    .eq("active", true)
    .order("full_name", { ascending: true })
  return (data ?? []).map((r) => ({
    id: String(r.id),
    nome: String(r.full_name ?? ""),
    role: String(r.role ?? ""),
  }))
}

export interface SchoolFilters {
  busca?: string
  cidade?: string
  etapa?: string
  ownerId?: string
}

/** Lista de escolas com filtros simples. */
export async function listSchools(filtros: SchoolFilters = {}): Promise<Escola[]> {
  await requireCan("hs.read")
  const supabase = await createClient()
  let q = supabase.from("schools").select("*").order("name", { ascending: true })

  if (filtros.cidade) q = q.eq("cidade", filtros.cidade)
  if (filtros.etapa) q = q.eq("relationship_stage", filtros.etapa)
  if (filtros.ownerId) q = q.eq("primary_owner_id", filtros.ownerId)
  if (filtros.busca) q = q.ilike("name", `%${filtros.busca}%`)

  const { data } = await q
  return (data ?? []).map(mapEscolaRow)
}

/** Séries estimadas por escola (para regra da fila "tem série elegível"). */
export async function listEstimatesByEscola(): Promise<Record<string, string[]>> {
  await requireCan("hs.read")
  const supabase = await createClient()
  const { data } = await supabase.from("school_grade_estimates").select("school_id,grade")
  const mapa: Record<string, string[]> = {}
  for (const r of data ?? []) {
    const k = String(r.school_id)
    ;(mapa[k] ??= []).push(String(r.grade))
  }
  return mapa
}

async function carregarParticipantesEResultados(
  supabase: Awaited<ReturnType<typeof createClient>>,
  acaoIds: string[],
): Promise<{ parts: Map<string, ParticipanteAcao[]>; res: Map<string, ResultadoSerie[]> }> {
  const parts = new Map<string, ParticipanteAcao[]>()
  const res = new Map<string, ResultadoSerie[]>()
  if (acaoIds.length === 0) return { parts, res }

  const [{ data: pData }, { data: rData }] = await Promise.all([
    supabase
      .from("school_action_participants")
      .select("school_action_id,user_id,role_in_action,profiles(full_name)")
      .in("school_action_id", acaoIds),
    supabase.from("school_action_grade_results").select("*").in("school_action_id", acaoIds),
  ])

  for (const p of pData ?? []) {
    const k = String(p.school_action_id)
    const nome = (p.profiles as { full_name?: string } | null)?.full_name
    ;(parts.get(k) ?? parts.set(k, []).get(k)!).push({
      userId: String(p.user_id),
      nome: nome ?? undefined,
      papelNaAcao: (p.role_in_action as string) ?? undefined,
    })
  }
  for (const r of rData ?? []) {
    const k = String(r.school_action_id)
    ;(res.get(k) ?? res.set(k, []).get(k)!).push(mapResultadoRow(r))
  }
  return { parts, res }
}

/** Ações da agenda com filtros de período/responsável/status. */
export interface ActionFilters {
  de?: string
  ate?: string
  ownerId?: string
  status?: string
  escolaId?: string
  tipo?: string
}

export async function listActions(filtros: ActionFilters = {}): Promise<AcaoEscola[]> {
  await requireCan("hs.read")
  const supabase = await createClient()
  let q = supabase
    .from("school_actions")
    .select("*, schools(name)")
    .order("action_date", { ascending: true })

  if (filtros.de) q = q.gte("action_date", filtros.de)
  if (filtros.ate) q = q.lte("action_date", filtros.ate)
  if (filtros.ownerId) q = q.eq("primary_owner_id", filtros.ownerId)
  if (filtros.status) q = q.eq("status", filtros.status)
  if (filtros.escolaId) q = q.eq("school_id", filtros.escolaId)
  if (filtros.tipo) q = q.eq("action_type", filtros.tipo)

  const { data } = await q
  const rows = data ?? []
  const ids = rows.map((r) => String(r.id))
  const { parts, res } = await carregarParticipantesEResultados(supabase, ids)

  return rows.map((r) => {
    const acao = mapAcaoRow(
      { ...r, school_name: (r.schools as { name?: string } | null)?.name },
      parts.get(String(r.id)) ?? [],
      res.get(String(r.id)) ?? [],
    )
    return acao
  })
}

export interface HistoricoEtapa {
  id: string
  anterior: string | null
  nova: string
  quando: string
  quem?: string
}
export interface HistoricoDono {
  id: string
  anterior?: string | null
  novo?: string | null
  quando: string
}

export interface Escola360 {
  escola: Escola
  contatos: ContatoEscola[]
  estimativas: EstimativaSerie[]
  acoes: AcaoEscola[]
  historicoEtapa: HistoricoEtapa[]
  historicoDono: HistoricoDono[]
}

/** Carrega tudo da tela Escola 360º em paralelo. */
export async function getSchool360(id: string): Promise<Escola360 | null> {
  await requireCan("hs.read")
  const supabase = await createClient()

  const { data: escolaRow } = await supabase.from("schools").select("*").eq("id", id).maybeSingle()
  if (!escolaRow) return null

  const [{ data: contatos }, { data: estimativas }, { data: acoesRows }, { data: hEtapa }, { data: hDono }] =
    await Promise.all([
      supabase.from("school_contacts").select("*").eq("school_id", id).order("is_primary", { ascending: false }),
      supabase
        .from("school_grade_estimates")
        .select("*")
        .eq("school_id", id)
        .order("academic_year", { ascending: false }),
      supabase.from("school_actions").select("*, schools(name)").eq("school_id", id).order("action_date", { ascending: false }),
      supabase
        .from("school_stage_history")
        .select("id,previous_stage,new_stage,changed_at,profiles(full_name)")
        .eq("school_id", id)
        .order("changed_at", { ascending: false }),
      supabase
        .from("school_owner_history")
        .select("id,previous_owner_id,new_owner_id,changed_at,prev:previous_owner_id(full_name),nov:new_owner_id(full_name)")
        .eq("school_id", id)
        .order("changed_at", { ascending: false }),
    ])

  const ids = (acoesRows ?? []).map((r) => String(r.id))
  const { parts, res } = await carregarParticipantesEResultados(supabase, ids)

  return {
    escola: mapEscolaRow(escolaRow),
    contatos: (contatos ?? []).map(mapContatoRow),
    estimativas: (estimativas ?? []).map(mapEstimativaRow),
    acoes: (acoesRows ?? []).map((r) =>
      mapAcaoRow(
        { ...r, school_name: (r.schools as { name?: string } | null)?.name },
        parts.get(String(r.id)) ?? [],
        res.get(String(r.id)) ?? [],
      ),
    ),
    historicoEtapa: (hEtapa ?? []).map((r) => ({
      id: String(r.id),
      anterior: (r.previous_stage as string) ?? null,
      nova: String(r.new_stage),
      quando: String(r.changed_at),
      quem: (r.profiles as { full_name?: string } | null)?.full_name,
    })),
    historicoDono: (hDono ?? []).map((r) => ({
      id: String(r.id),
      anterior: (r.prev as { full_name?: string } | null)?.full_name ?? null,
      novo: (r.nov as { full_name?: string } | null)?.full_name ?? null,
      quando: String(r.changed_at),
    })),
  }
}
