"use server"

import { revalidatePath } from "next/cache"
import { requireCan } from "@/lib/auth/guards"
import { createClient } from "@/lib/supabase/server"
import { mapGradeRow } from "@/lib/domain/high-school"
import {
  isUuid,
  validateCapturePayload,
  type CaptureCommand,
} from "@/lib/school-capture/domain"

type Result = { ok: boolean; message: string; id?: string }
function refreshSchoolCapture(schoolId?: string) {
  for (const path of [
    "/high-school/captacao-escolas",
    "/high-school",
    "/high-school/agenda",
    "/atendimento",
    "/atendimento/minha-agenda",
    "/supervest",
    "/gestao/metas",
  ])
    revalidatePath(path)
  if (schoolId) revalidatePath(`/high-school/escolas/${schoolId}`)
}
export async function saveSchoolCapture(input: {
  schoolId: string
  cycleId: string
  command: CaptureCommand
  payload: Record<string, unknown>
}): Promise<Result> {
  try {
    const actor = await requireCan("hs.capture.write")
    if (!isUuid(input.schoolId) || !isUuid(input.cycleId))
      throw new Error("Selecione uma escola e uma edição válidas.")
    if (
      !["start", "contact", "close", "associate", "action", "result"].includes(
        input.command,
      )
    )
      throw new Error("Operação inválida.")
    if (
      input.command === "associate" &&
      !["gerente", "supervisor"].includes(actor.role)
    )
      throw new Error("Somente a gestão pode associar ações antigas.")
    const supabase = await createClient()
    const { data: grades, error: gradeError } = await supabase
      .from("grade_levels")
      .select("code,label,sort_order,active,supervest_eligible")
    if (gradeError) throw new Error(gradeError.message)
    const payload = validateCapturePayload(
      input.command,
      input.payload,
      (grades ?? []).map(mapGradeRow),
    )
    const { data, error } = await supabase.rpc("save_school_capture", {
      p_school_id: input.schoolId,
      p_cycle_id: input.cycleId,
      p_command: input.command,
      p_payload: payload,
    })
    if (error) throw new Error(error.message)
    refreshSchoolCapture(input.schoolId)
    return {
      ok: true,
      message: "Registro salvo na edição selecionada.",
      id: data?.id ?? undefined,
    }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o registro.",
    }
  }
}
export async function configureCaptureCycle(form: FormData): Promise<Result> {
  try {
    await requireCan("supervest.write")
    const cycleId = String(form.get("cycleId") ?? "")
    const year = Number(form.get("academicYear"))
    const start = String(form.get("start") ?? "") || null,
      end = String(form.get("end") ?? "") || null
    if (
      !isUuid(cycleId) ||
      !Number.isInteger(year) ||
      year < 1900 ||
      year > 2200
    )
      throw new Error("Informe a edição e o ano letivo da divulgação.")
    if (start && end && end < start)
      throw new Error("O período de captação é inválido.")
    const supabase = await createClient()
    const { error } = await supabase.rpc("configure_school_capture_cycle", {
      p_cycle_id: cycleId,
      p_year: year,
      p_start: start,
      p_end: end,
      p_active: form.get("active") === "on",
    })
    if (error) throw new Error(error.message)
    refreshSchoolCapture()
    return { ok: true, message: "Configuração da edição salva." }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Não foi possível configurar a edição.",
    }
  }
}
export async function saveSchoolGrades(input: {
  schoolId: string
  grades: string[]
}): Promise<Result> {
  try {
    await requireCan("hs.write")
    if (!isUuid(input.schoolId) || !Array.isArray(input.grades))
      throw new Error("Cadastro inválido.")
    const supabase = await createClient()
    const { data: grades, error: gradeError } = await supabase
      .from("grade_levels")
      .select("code")
    if (gradeError) throw new Error(gradeError.message)
    if (input.grades.some((code) => !grades?.some((g) => g.code === code)))
      throw new Error("Selecione séries válidas.")
    const { data, error } = await supabase
      .from("schools")
      .update({ offered_grades: [...new Set(input.grades)] })
      .eq("id", input.schoolId)
      .select("id")
      .single()
    if (error || !data)
      throw new Error(error?.message ?? "Escola não encontrada.")
    refreshSchoolCapture(input.schoolId)
    return { ok: true, message: "Séries da escola confirmadas." }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Não foi possível confirmar as séries.",
    }
  }
}
