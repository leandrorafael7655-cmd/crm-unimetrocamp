"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireCan } from "@/lib/auth/guards"

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

const STATUS = [
  "planejamento",
  "captacao",
  "evento_proximo",
  "evento_realizado",
  "encerrado",
  "cancelado",
]

export async function createSupervestCycle(form: FormData): Promise<Resultado> {
  try {
    const actor = await requireCan("supervest.write")
    const supabase = await createClient()
    const name = s(form.get("name"))
    if (!name) return { ok: false, message: "Informe o nome do SuperVestibular." }
    const status = s(form.get("status")) || "planejamento"
    if (!STATUS.includes(status)) return { ok: false, message: "Status inválido." }

    const { data, error } = await supabase
      .from("supervest_cycles")
      .insert({
        name,
        edition: nullable(form.get("edition")),
        academic_cycle: nullable(form.get("academic_cycle")),
        campaign_start_at: nullable(form.get("campaign_start_at")),
        campaign_end_at: nullable(form.get("campaign_end_at")),
        event_at: nullable(form.get("event_at")),
        registrations_target: n(form.get("registrations_target")),
        high_school_actions_target: n(form.get("high_school_actions_target")),
        status,
        notes: nullable(form.get("notes")),
        created_by: actor.id,
        updated_by: actor.id,
      })
      .select("id")
      .single()
    if (error) throw error
    revalidatePath("/supervest")
    return { ok: true, id: data.id }
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Erro ao criar SuperVestibular." }
  }
}

export async function updateSupervestCycle(form: FormData): Promise<Resultado> {
  try {
    const actor = await requireCan("supervest.write")
    const supabase = await createClient()
    const id = s(form.get("id"))
    if (!id) return { ok: false, message: "Ciclo inválido." }
    const patch: Record<string, unknown> = { updated_by: actor.id }
    for (const key of [
      "name",
      "edition",
      "academic_cycle",
      "campaign_start_at",
      "campaign_end_at",
      "event_at",
      "status",
      "notes",
    ]) {
      if (form.get(key) != null) patch[key] = nullable(form.get(key))
    }
    if (form.get("registrations_target") != null)
      patch.registrations_target = n(form.get("registrations_target"))
    if (form.get("high_school_actions_target") != null)
      patch.high_school_actions_target = n(form.get("high_school_actions_target"))

    const { error } = await supabase.from("supervest_cycles").update(patch).eq("id", id)
    if (error) throw error
    revalidatePath("/supervest")
    return { ok: true, id }
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Erro ao atualizar SuperVestibular." }
  }
}

/**
 * Lançamento manual da inscrição oficial do dia. UNIQUE (cycle_id, snapshot_date)
 * garante uma leitura por dia — reenvio do mesmo dia atualiza o valor.
 */
export async function addSupervestSnapshot(form: FormData): Promise<Resultado> {
  try {
    const actor = await requireCan("supervest.write")
    const supabase = await createClient()
    const cycleId = s(form.get("cycle_id"))
    const snapshotDate = s(form.get("snapshot_date"))
    const official = n(form.get("official_registrations"))
    if (!cycleId || !snapshotDate) return { ok: false, message: "Informe ciclo e data." }
    if (official < 0) return { ok: false, message: "O total oficial não pode ser negativo." }

    const { error } = await supabase.from("supervest_snapshots").upsert(
      {
        cycle_id: cycleId,
        snapshot_date: snapshotDate,
        official_registrations: official,
        entered_by: actor.id,
        notes: nullable(form.get("notes")),
      },
      { onConflict: "cycle_id,snapshot_date" },
    )
    if (error) throw error
    revalidatePath("/supervest")
    return { ok: true }
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Erro ao lançar inscrição oficial." }
  }
}
