"use server"
import { requireCan } from "@/lib/auth/guards"
import { createClient } from "@/lib/supabase/server"
import { isUuid } from "@/lib/domain/validation"
import { revalidatePath } from "next/cache"
export async function setSchoolArchived(id: string, archived: boolean) {
  try {
    await requireCan("hs.write")
    if (!isUuid(id) || typeof archived !== "boolean") throw new Error("Escola inválida.")
    const { error } = await (await createClient()).rpc("set_commercial_archive", { p_type: "school", p_id: id, p_archived: archived, p_reason: archived ? "Encerramento comercial" : "Reativação comercial" })
    if (error) throw new Error(error.message)
    revalidatePath("/high-school", "layout")
    return { ok: true, message: archived ? "Escola arquivada; histórico preservado." : "Escola reativada." }
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Não foi possível salvar." } }
}
