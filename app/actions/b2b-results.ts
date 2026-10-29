"use server"
import { requireRole } from "@/lib/auth/guards"
import { createClient } from "@/lib/supabase/server"
import { isUuid, nonNegativeInteger } from "@/lib/domain/validation"
import { revalidatePath } from "next/cache"

export async function saveB2bResult(form: FormData) {
  try {
    await requireRole("gerente")
    const value = (key: string) => String(form.get(key) || "").trim()
    const integer = (key: string) => value(key) === "" ? null : Number(value(key))
    const company = value("company_id"), user = value("user_id"), cycle = value("commercial_cycle_id")
    const target = integer("target_value"), registrations = integer("registrations"), revision = Number(value("revision"))
    if (![company, user, cycle].every(isUuid) || !Number.isSafeInteger(revision) || revision < 0) throw new Error("Selecione consultor, empresa e ciclo válidos.")
    if (!nonNegativeInteger(target) || !nonNegativeInteger(registrations)) throw new Error("Use números inteiros de zero a 2.147.483.647 ou deixe sem lançamento.")
    if (value("notes").length > 5000) throw new Error("Observações: até 5.000 caracteres.")
    const { error } = await (await createClient()).rpc("save_b2b_result", {
      p_company: company, p_user: user, p_cycle: cycle, p_target: target,
      p_registrations: registrations, p_notes: value("notes") || null, p_revision: revision,
    })
    if (error) throw new Error(error.message)
    revalidatePath("/gestao/metas", "layout")
    return { ok: true, message: "Lançamento salvo e registrado no histórico." }
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Não foi possível salvar." } }
}
