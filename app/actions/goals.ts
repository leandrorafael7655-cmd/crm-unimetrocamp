"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireCan } from "@/lib/auth/guards"
import { listGoalHistory, type GoalHistoryRow } from "@/lib/data/goals-queries"

type Resultado = { ok: boolean; message?: string; id?: string }

function s(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : ""
}
function n(v: FormDataEntryValue | null): number {
  const x = Number(s(v))
  return Number.isFinite(x) ? x : 0
}
function nullable(v: FormDataEntryValue | null): string | null {
  const x = s(v)
  return x === "" ? null : x
}

/* ─────────────────────────────  ciclos comerciais  ───────────────────────── */

export async function createCommercialCycle(form: FormData): Promise<Resultado> {
  try {
    await requireCan("goals.write")
    const supabase = await createClient()
    const name = s(form.get("name"))
    const startAt = s(form.get("start_at"))
    const endAt = s(form.get("end_at"))
    if (!name || !startAt || !endAt) return { ok: false, message: "Preencha nome e período." }
    if (endAt < startAt) return { ok: false, message: "A data final não pode ser antes da inicial." }
    const { data, error } = await supabase
      .from("commercial_cycles")
      .insert({ name, start_at: startAt, end_at: endAt, status: s(form.get("status")) || "ativo" })
      .select("id")
      .single()
    if (error) throw error
    revalidatePath("/gestao/metas")
    return { ok: true, id: data.id }
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Erro ao criar ciclo comercial." }
  }
}

/* ─────────────────────────────  metas  ───────────────────────── */

export async function createGoal(form: FormData): Promise<Resultado> {
  try {
    await requireCan("goals.write")
    const supabase = await createClient()

    const goalType = s(form.get("goal_type"))
    const scopeType = s(form.get("scope_type")) || "geral"
    const targetValue = n(form.get("target_value"))
    const startAt = s(form.get("start_at"))
    const endAt = s(form.get("end_at"))
    const userId = nullable(form.get("user_id"))

    if (!goalType) return { ok: false, message: "Escolha o tipo de meta." }
    if (!startAt || !endAt) return { ok: false, message: "Informe o período de vigência." }
    if (endAt < startAt) return { ok: false, message: "A data final não pode ser antes da inicial." }
    if (targetValue < 0) return { ok: false, message: "O alvo não pode ser negativo." }
    if (scopeType === "individual" && !userId)
      return { ok: false, message: "Meta individual exige um responsável." }

    const { data, error } = await supabase
      .from("goals")
      .insert({
        goal_type: goalType,
        scope_type: scopeType,
        team_type: nullable(form.get("team_type")),
        user_id: userId,
        commercial_cycle_id: nullable(form.get("commercial_cycle_id")),
        supervest_cycle_id: nullable(form.get("supervest_cycle_id")),
        target_value: targetValue,
        start_at: startAt,
        end_at: endAt,
        status: s(form.get("status")) || "ativa",
        notes: nullable(form.get("notes")),
      })
      .select("id")
      .single()
    if (error) throw error
    revalidatePath("/gestao/metas")
    return { ok: true, id: data.id }
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Erro ao criar meta." }
  }
}

/**
 * Edição de meta com motivo. Passa pela RPC update_goal para que o trigger
 * grave o motivo em goal_history na mesma transação. O realizado é derivado —
 * alterar a meta NUNCA apaga o realizado.
 */
export async function updateGoal(form: FormData): Promise<Resultado> {
  try {
    await requireCan("goals.write")
    const supabase = await createClient()
    const id = s(form.get("id"))
    if (!id) return { ok: false, message: "Meta inválida." }

    const target = form.get("target_value") != null ? n(form.get("target_value")) : null
    const startAt = nullable(form.get("start_at"))
    const endAt = nullable(form.get("end_at"))
    if (target != null && target < 0) return { ok: false, message: "O alvo não pode ser negativo." }
    if (startAt && endAt && endAt < startAt)
      return { ok: false, message: "A data final não pode ser antes da inicial." }

    const { error } = await supabase.rpc("update_goal", {
      p_id: id,
      p_target: target,
      p_status: nullable(form.get("status")),
      p_start: startAt,
      p_end: endAt,
      p_notes: nullable(form.get("notes")),
      p_reason: nullable(form.get("reason")),
    })
    if (error) throw error
    revalidatePath("/gestao/metas")
    return { ok: true, id }
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Erro ao atualizar meta." }
  }
}

/** Histórico de alterações de uma meta (para o modal de edição). */
export async function getGoalHistory(goalId: string): Promise<GoalHistoryRow[]> {
  try {
    await requireCan("goals.read.own")
    return await listGoalHistory(goalId)
  } catch {
    return []
  }
}

/* ─────────────────────────────  exceções de semana  ───────────────────────── */

export async function upsertWeekException(form: FormData): Promise<Resultado> {
  try {
    const actor = await requireCan("goals.write")
    const supabase = await createClient()
    const userId = s(form.get("user_id"))
    const weekStart = s(form.get("week_start"))
    if (!userId || !weekStart) return { ok: false, message: "Informe consultor e semana." }
    const { error } = await supabase.from("goal_week_exceptions").upsert(
      {
        user_id: userId,
        week_start: weekStart,
        reason: nullable(form.get("reason")),
        notes: nullable(form.get("notes")),
        authorized_by: actor.id,
      },
      { onConflict: "user_id,week_start" },
    )
    if (error) throw error
    revalidatePath("/gestao/metas")
    return { ok: true }
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Erro ao marcar semana." }
  }
}

export async function removeWeekException(form: FormData): Promise<Resultado> {
  try {
    await requireCan("goals.write")
    const supabase = await createClient()
    const id = s(form.get("id"))
    if (!id) return { ok: false, message: "Registro inválido." }
    const { error } = await supabase.from("goal_week_exceptions").delete().eq("id", id)
    if (error) throw error
    revalidatePath("/gestao/metas")
    return { ok: true }
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Erro ao remover exceção." }
  }
}
