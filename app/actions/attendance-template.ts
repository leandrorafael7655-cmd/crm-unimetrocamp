"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireCan } from "@/lib/auth/guards"
import type { AttendanceLane } from "@/lib/domain/attendance"

export async function updateRotationEntry(input: {
  weekIndex: number
  lane: AttendanceLane
  position: 1 | 2
  slotKey: string
}) {
  try {
    const actor = await requireCan("attendance.manage")
    if (![1, 2, 3, 4].includes(input.weekIndex)) return { ok: false, message: "Semana inválida." }
    if (![1, 2].includes(input.position)) return { ok: false, message: "Posição inválida." }
    const admin = createAdminClient()
    const { data: slot } = await admin.from("attendance_team_slots").select("slot_key").eq("slot_key", input.slotKey).maybeSingle()
    if (!slot) return { ok: false, message: "Posição de consultor inválida." }
    const { error } = await admin.from("attendance_rotation_template").upsert(
      {
        week_index: input.weekIndex,
        lane: input.lane,
        position: input.position,
        slot_key: input.slotKey,
        updated_by: actor.id,
      },
      { onConflict: "week_index,lane,position" },
    )
    if (error) return { ok: false, message: error.message }
    revalidatePath("/atendimento")
    return { ok: true, message: "Modelo de rodízio atualizado." }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Falha ao atualizar rodízio." }
  }
}
