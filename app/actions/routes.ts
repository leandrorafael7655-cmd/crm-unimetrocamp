"use server"

import { isCivilDate, validateRouteSchedule, nonNegativeInteger, isUuid, isClockTime } from "@/lib/domain/validation"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireCan } from "@/lib/auth/guards"
import { planejarRota, type ParadaPlano, type Coord, type ResultadoOtimizacao } from "@/lib/data/mapbox-optimize"
import { sugerirProximidade, type SugestaoProximidade } from "@/lib/data/route-queries"

export interface ParadaPayload {
  entity_type: "company" | "school"
  entity_id: string
  lat: number
  lng: number
  fixed_time?: string | null
  visit_minutes?: number | null
  notes?: string | null
}

export interface OtimizarPayload {
  origem: Coord
  destino: Coord
  paradas: ParadaPayload[]
  avgVisitMinutes: number
  departureTime?: string | null
}

/** Otimiza a rota SEM persistir. Retorna ordem, ETA por parada e totais. */
export async function otimizarRotaAction(payload: OtimizarPayload): Promise<ResultadoOtimizacao> {
  await requireCan("routes.plan")
  if (!payload.paradas?.length) {
    return { ok: false, erro: "Selecione ao menos uma parada.", otimizado: false, ordem: [], etaPorParada: {}, totalDistanceM: 0, totalDurationS: 0 }
  }
  const paradas: ParadaPlano[] = payload.paradas.map((p) => ({
    id: p.entity_id,
    coord: { lat: p.lat, lng: p.lng },
    fixedTime: p.fixed_time ?? null,
    visitMinutes: p.visit_minutes ?? null,
  }))
  try {
    const r = await planejarRota({
      origem: payload.origem,
      destino: payload.destino,
      paradas,
      avgVisitMinutes: payload.avgVisitMinutes,
      departureTime: payload.departureTime,
    })
    if (!r.otimizado && !r.excedeuLimite && !r.erro) {
      // API não otimizou nenhum trecho: comunica claramente e mantém ordem manual.
      return { ...r, erro: "Não foi possível otimizar pela Mapbox agora. A ordem manual foi mantida." }
    }
    return r
  } catch (e) {
    return {
      ok: false,
      erro: `Falha na otimização: ${(e as Error).message}. A ordem manual foi mantida.`,
      otimizado: false,
      ordem: payload.paradas.map((p) => p.entity_id),
      etaPorParada: {},
      totalDistanceM: 0,
      totalDurationS: 0,
    }
  }
}

export interface StopSalvar {
  entity_type: "company" | "school"
  entity_id: string
  sort_order: number
  fixed_time?: string | null
  estimated_arrival?: string | null
  visit_minutes?: number | null
  notes?: string | null
}

export interface SalvarPlanoPayload {
  id?: string | null
  route_name?: string | null
  plan_date: string
  origin_label?: string | null
  origin_lat?: number | null
  origin_lng?: number | null
  destination_label?: string | null
  destination_lat?: number | null
  destination_lng?: number | null
  departure_time?: string | null
  return_time?: string | null
  avg_visit_minutes: number
  status?: string
  optimized?: boolean
  total_distance_m?: number | null
  total_duration_s?: number | null
  notes?: string | null
  stops: StopSalvar[]
}

/** Cria ou atualiza um plano e substitui suas paradas. Dono = ator (RLS reforça). */
export async function salvarPlanoAction(payload: SalvarPlanoPayload): Promise<{ ok: boolean; id?: string; message?: string }> {
  try {
    const actor = await requireCan("routes.plan")
    if (!isCivilDate(payload.plan_date)) return { ok: false, message: "Data da rota inválida." }
    const scheduleError = validateRouteSchedule(payload.plan_date,payload.departure_time,payload.return_time)
    if (scheduleError) return { ok: false, message: scheduleError }
    if (!Array.isArray(payload.stops) || payload.stops.some(s => !isUuid(s.entity_id) || !["company","school"].includes(s.entity_type)
      || !nonNegativeInteger(s.sort_order,false) || !nonNegativeInteger(s.visit_minutes) || (s.visit_minutes ?? 0)>600
      || s.fixed_time && !isClockTime(s.fixed_time) || s.estimated_arrival && !isClockTime(s.estimated_arrival))) {
      return { ok: false, message: "Paradas inválidas." }
    }
    const supabase = await createClient()
    const routeName = payload.route_name?.trim() ?? ""
    if (!routeName) return { ok: false, message: "Dê um nome para a rota antes de salvar." }
    if (routeName.length > 120) return { ok: false, message: "O nome da rota deve ter no máximo 120 caracteres." }

    const base = {
      route_name: routeName,
      owner_id: actor.id,
      plan_date: payload.plan_date,
      origin_label: payload.origin_label ?? null,
      origin_lat: payload.origin_lat ?? null,
      origin_lng: payload.origin_lng ?? null,
      destination_label: payload.destination_label ?? null,
      destination_lat: payload.destination_lat ?? null,
      destination_lng: payload.destination_lng ?? null,
      departure_time: payload.departure_time ?? null,
      return_time: payload.return_time ?? null,
      avg_visit_minutes: payload.avg_visit_minutes,
      status: payload.status ?? (payload.optimized ? "otimizada" : "rascunho"),
      optimized_at: payload.optimized ? new Date().toISOString() : null,
      total_distance_m: payload.total_distance_m ?? null,
      total_duration_s: payload.total_duration_s ?? null,
      notes: payload.notes ?? null,
    }

    const { data: planId, error } = await supabase.rpc("save_route_plan_atomic", {
      p_id: payload.id || null, p_plan: base, p_stops: payload.stops,
    })
    if (error || !planId) return { ok: false, message: error?.message ?? "Gravação não confirmada." }

    revalidatePath("/mapa/rotas")
    return { ok: true, id: planId! }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

export async function excluirPlanoAction(id: string): Promise<{ ok: boolean; message?: string }> {
  try {
    await requireCan("routes.plan")
    const supabase = await createClient()
    const { error } = await supabase.from("route_plans").delete().eq("id", id)
    if (error) return { ok: false, message: error.message }
    revalidatePath("/mapa/rotas")
    return { ok: true }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

export async function sugerirProximidadeAction(payload: {
  ancoras: Coord[]
  excluirIds: string[]
  raioKm?: number
}): Promise<SugestaoProximidade[]> {
  const actor = await requireCan("routes.plan")
  return sugerirProximidade({ ...payload, actor })
}
