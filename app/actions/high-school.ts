"use server"

/* ─────────────────────────  Server Actions — High School  ─────────────────────────
   Escritas do módulo HS. Usam o cliente com a SESSÃO do usuário (RLS + triggers
   dependem de auth.uid()), nunca o service_role. A autorização é dupla: RLS no
   banco (is_high_school_writer / is_manager) e requireCan() aqui, para dar
   mensagem clara antes de tocar o banco. Consultor B2B tem hs.read mas NÃO
   hs.write — logo estas actions o bloqueiam. */

import { validateSchedule, nonNegativeInteger } from "@/lib/domain/validation"
import { cnpjValido } from "@/lib/domain/utils"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireCan } from "@/lib/auth/guards"
import { REDES_ESCOLA, TODAS_ETAPAS_HS, STATUS_ACAO_HS, TIPOS_ACAO_HS } from "@/lib/domain/high-school"
import { flushCalendarQueue } from "@/lib/calendar/calendar-dispatch"

export interface ActionResult {
  ok: boolean
  message: string
  id?: string
}

const s = (v: FormDataEntryValue | null | undefined): string => (v == null ? "" : String(v)).trim()
const nOrNull = (v: FormDataEntryValue | null | undefined): number | null => {
  const t = s(v)
  if (t === "") return null
  const x = Number(t)
  return Number.isFinite(x) ? x : null
}
const orNull = (t: string): string | null => (t === "" ? null : t)

function revalidarHS() {
  revalidatePath("/high-school")
  revalidatePath("/high-school/escolas")
  revalidatePath("/high-school/pipeline")
  revalidatePath("/high-school/agenda")
  revalidatePath("/atendimento")
  revalidatePath("/atendimento/minha-agenda")
  revalidatePath("/high-school/captacao-escolas")
}

/* ─────────────────────────  ESCOLAS  ───────────────────────── */
export async function upsertSchool(form: FormData): Promise<ActionResult> {
  try {
    await requireCan("hs.write")
    const supabase = await createClient()

    const nome = s(form.get("nome"))
    if (!nome) return { ok: false, message: "Informe o nome da escola." }

    if (s(form.get("cnpj")) && !cnpjValido(s(form.get("cnpj")))) return { ok: false, message: "CNPJ inválido." }
    const rede = s(form.get("rede")) || "Outra"
    if (!REDES_ESCOLA.includes(rede as (typeof REDES_ESCOLA)[number]))
      return { ok: false, message: "Rede inválida." }

    const etapa = s(form.get("etapa")) || "Mapeada"
    if (!(TODAS_ETAPAS_HS as readonly string[]).includes(etapa))
      return { ok: false, message: "Etapa inválida." }

    const payload = {
      name: nome,
      inep_code: orNull(s(form.get("inep"))),
      cnpj: orNull(s(form.get("cnpj"))),
      network_type: rede,
      cidade: orNull(s(form.get("cidade"))),
      bairro: orNull(s(form.get("bairro"))),
      logradouro: orNull(s(form.get("logradouro"))),
      numero: orNull(s(form.get("numero"))),
      complemento: orNull(s(form.get("complemento"))),
      cep: orNull(s(form.get("cep"))),
      phone: orNull(s(form.get("telefone"))),
      email: orNull(s(form.get("email"))),
      website: orNull(s(form.get("site"))),
      instagram: orNull(s(form.get("instagram"))),
      relationship_stage: etapa,
      relationship_status: orNull(s(form.get("status"))),
      potential: orNull(s(form.get("potencial"))),
      classification: orNull(s(form.get("classificacao"))),
      offered_grades: form.get("gradesKnown")==="on" ? [...new Set(form.getAll("offeredGrades").map(String))] : null,
      next_action: orNull(s(form.get("proximaAcao"))),
      next_action_at: orNull(s(form.get("proximaAcaoEm"))),
      notes: orNull(s(form.get("observacoes"))),
    }

    if(payload.offered_grades) {
      const {data:grades,error}=await supabase.from("grade_levels").select("code")
      if(error)return {ok:false,message:error.message}
      if(payload.offered_grades.some(code=>!grades?.some(g=>g.code===code)))return {ok:false,message:"Série inválida."}
    }
    const id = s(form.get("id"))
    if (id) {
      const { error } = await supabase.from("schools").update(payload).eq("id", id)
      if (error) return { ok: false, message: `Falha ao salvar: ${error.message}` }
      revalidarHS()
      revalidatePath(`/high-school/escolas/${id}`)
      return { ok: true, message: "Escola atualizada.", id }
    }

    const { data: actor } = await supabase.auth.getUser()
    const { data: row, error } = await supabase
      .from("schools")
      .insert({ ...payload, created_by: actor.user?.id ?? null })
      .select("id")
      .single()
    if (error || !row) return { ok: false, message: `Falha ao criar: ${error?.message ?? "desconhecido"}` }
    revalidarHS()
    return { ok: true, message: "Escola criada.", id: String(row.id) }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro inesperado." }
  }
}

export async function deleteSchool(id: string): Promise<ActionResult> {
  try {
    await requireCan("hs.write")
    if (!id) return { ok: false, message: "Escola não informada." }
    const supabase = await createClient()
    // RLS permite DELETE apenas para gerência; se não for, o banco recusa.
    const { error } = await supabase.from("schools").delete().eq("id", id)
    if (error) return { ok: false, message: `Sem permissão para excluir ou falha: ${error.message}` }
    revalidarHS()
    return { ok: true, message: "Escola removida." }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro inesperado." }
  }
}

/* ─────────────────────────  CONTATOS  ───────────────────────── */
export async function upsertContact(form: FormData): Promise<ActionResult> {
  try {
    await requireCan("hs.write")
    const supabase = await createClient()
    const escolaId = s(form.get("escolaId"))
    const nome = s(form.get("nome"))
    if (!escolaId) return { ok: false, message: "Escola não informada." }
    if (!nome) return { ok: false, message: "Informe o nome do contato." }

    const principal = s(form.get("principal")) === "on" || s(form.get("principal")) === "true"
    // Índice único parcial garante 1 principal; ao marcar um novo, desmarcamos os demais.
    if (principal) {
      await supabase.from("school_contacts").update({ is_primary: false }).eq("school_id", escolaId)
    }

    const payload = {
      school_id: escolaId,
      name: nome,
      role: orNull(s(form.get("papel"))),
      phone: orNull(s(form.get("telefone"))),
      whatsapp: orNull(s(form.get("whatsapp"))),
      email: orNull(s(form.get("email"))),
      is_primary: principal,
      notes: orNull(s(form.get("observacoes"))),
    }

    const id = s(form.get("id"))
    const { error } = id
      ? await supabase.from("school_contacts").update(payload).eq("id", id)
      : await supabase.from("school_contacts").insert(payload)
    if (error) return { ok: false, message: `Falha ao salvar contato: ${error.message}` }
    revalidatePath(`/high-school/escolas/${escolaId}`)
    return { ok: true, message: "Contato salvo." }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro inesperado." }
  }
}

export async function deleteContact(id: string, escolaId: string): Promise<ActionResult> {
  try {
    await requireCan("hs.write")
    const supabase = await createClient()
    const { error } = await supabase.from("school_contacts").delete().eq("id", id)
    if (error) return { ok: false, message: `Falha ao remover: ${error.message}` }
    revalidatePath(`/high-school/escolas/${escolaId}`)
    return { ok: true, message: "Contato removido." }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro inesperado." }
  }
}

/* ─────────────────────────  ESTIMATIVA POR SÉRIE  ───────────────────────── */
export async function upsertEstimate(form: FormData): Promise<ActionResult> {
  try {
    await requireCan("hs.write")
    const supabase = await createClient()
    const escolaId = s(form.get("escolaId"))
    const serie = s(form.get("serie"))
    const ano = nOrNull(form.get("anoLetivo"))
    if (!escolaId || !serie || !ano) return { ok: false, message: "Escola, série e ano são obrigatórios." }

    const { data: actor } = await supabase.auth.getUser()
    const { error } = await supabase.from("school_grade_estimates").upsert(
      {
        school_id: escolaId,
        academic_year: ano,
        grade: serie,
        estimated_students: nOrNull(form.get("estimativaAlunos")),
        number_of_classes: nOrNull(form.get("numTurmas")),
        updated_by: actor.user?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "school_id,academic_year,grade" },
    )
    if (error) return { ok: false, message: `Falha ao salvar estimativa: ${error.message}` }
    revalidatePath(`/high-school/escolas/${escolaId}`)
    return { ok: true, message: "Estimativa salva." }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro inesperado." }
  }
}

/* ─────────────────────────  AÇÕES  ─────────────────────────
   Payload JSON (não FormData) por causa das listas aninhadas (participantes e
   resultados por série). A regra lead×inscrição é validada aqui LENDO
   grade_levels.supervest_eligible — e ainda reforçada por trigger no banco. */
export interface ResultadoInput {
  serie: string
  turmas?: number | null
  impactados?: number | null
  leads?: number | null
  inscricoesSupervest?: number | null
}
export interface AcaoInput {
  id?: string
  escolaId: string
  data: string
  inicio?: string | null
  fim?: string | null
  tipo: string
  objetivo?: string
  status?: string
  estimativaAlunos?: number | null
  estimativaTurmas?: number | null
  observacoes?: string
  resultadoObs?: string
  primaryOwnerId?: string | null
  supervestCicloId?: string | null
  comercialCicloId?: string | null
  participantes?: { userId: string; papelNaAcao?: string }[]
  resultados?: ResultadoInput[]
}

export async function upsertAction(input: AcaoInput): Promise<ActionResult> {
  try {
    await requireCan("hs.write")
    const supabase = await createClient()

    if (!input.escolaId) return { ok: false, message: "Escola não informada." }
    const scheduled = ["agendada","confirmada","reagendada"].includes(input.status || "agendada")
    const scheduleError = validateSchedule(input.data, input.inicio, input.fim, scheduled)
    if (scheduleError) return { ok: false, message: scheduleError }
    if (scheduled && !input.primaryOwnerId) return { ok:false,message:"Selecione o consultor responsável pelo agendamento." }
    if (![input.estimativaAlunos,input.estimativaTurmas,...(input.resultados ?? []).flatMap(r => [r.turmas,r.impactados,r.leads,r.inscricoesSupervest])].every(v => nonNegativeInteger(v))) {
      return { ok: false, message: "Quantidades devem ser inteiros não negativos." }
    }
    const tipo = input.tipo || "Outra"
    if (!TIPOS_ACAO_HS.includes(tipo as (typeof TIPOS_ACAO_HS)[number]))
      return { ok: false, message: "Tipo de ação inválido." }
    const status = input.status || "agendada"
    if (!STATUS_ACAO_HS.includes(status as (typeof STATUS_ACAO_HS)[number]))
      return { ok: false, message: "Status inválido." }

    const payload = {
      school_id: input.escolaId,
      action_date: input.data,
      start_time: input.inicio || null,
      end_time: input.fim || null,
      action_type: tipo,
      objective: input.objetivo || null,
      status,
      estimated_students: input.estimativaAlunos ?? null,
      estimated_classes: input.estimativaTurmas ?? null,
      notes: input.observacoes || null,
      result_notes: input.resultadoObs || null,
      primary_owner_id: input.primaryOwnerId || null,
      supervest_cycle_id: input.supervestCicloId || null,
      commercial_cycle_id: input.comercialCicloId || null,
    }

    const { data: acaoId, error } = await supabase.rpc("save_school_action_atomic", {
      p_id: input.id || null,
      p_action: payload,
      p_participants: (input.participantes ?? []).map(p => ({ user_id: p.userId, role_in_action: p.papelNaAcao || null })),
      p_results: (input.resultados ?? []).map(r => ({ grade: r.serie, classes_count: r.turmas ?? null,
        estimated_impacted: r.impactados ?? null, leads: r.leads ?? 0, supervest_registrations: r.inscricoesSupervest ?? 0 })),
    })
    if (error || !acaoId) return { ok: false, message: `Não foi possível salvar a ação: ${error?.message ?? "gravação não confirmada"}` }

    revalidarHS()
    revalidatePath(`/high-school/escolas/${input.escolaId}`)
    const dispatch = await flushCalendarQueue(supabase, { batches: 2, limit: 25 })
    const calendarCandidate = Boolean(input.primaryOwnerId && input.inicio && input.fim && ["agendada", "confirmada", "reagendada"].includes(status))
    const message = calendarCandidate && !dispatch.configured
      ? "Ação salva. O convite ficou pendente até o provedor de e-mail ser configurado."
      : calendarCandidate && dispatch.sent > 0
        ? "Ação salva. Convite enviado ao provedor de e-mail."
        : "Ação salva."
    return { ok: true, message, id: acaoId }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro inesperado." }
  }
}

export async function setActionStatus(id: string, status: string, escolaId?: string): Promise<ActionResult> {
  try {
    await requireCan("hs.write")
    if (!STATUS_ACAO_HS.includes(status as (typeof STATUS_ACAO_HS)[number]))
      return { ok: false, message: "Status inválido." }
    const supabase = await createClient()
    const { error } = await supabase.from("school_actions").update({ status }).eq("id", id).select("id").single()
    if (error) return { ok: false, message: `Falha ao atualizar: ${error.message}` }
    revalidarHS()
    if (escolaId) revalidatePath(`/high-school/escolas/${escolaId}`)
    await flushCalendarQueue(supabase, { batches: 2, limit: 25 })
    return { ok: true, message: "Status atualizado. Alterações de calendário foram processadas quando aplicável." }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro inesperado." }
  }
}

export async function deleteAction(id: string, escolaId?: string): Promise<ActionResult> {
  try {
    await requireCan("hs.write")
    const supabase = await createClient()
    const { error } = await supabase.from("school_actions").delete().eq("id", id).select("id").single()
    if (error) return { ok: false, message: `Falha ao remover: ${error.message}` }
    revalidarHS()
    if (escolaId) revalidatePath(`/high-school/escolas/${escolaId}`)
    await flushCalendarQueue(supabase, { batches: 2, limit: 25 })
    return { ok: true, message: "Ação removida. O cancelamento de calendário foi processado quando aplicável." }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro inesperado." }
  }
}
