"use server"

/* ─────────────────────────  Server Actions — High School  ─────────────────────────
   Escritas do módulo HS. Usam o cliente com a SESSÃO do usuário (RLS + triggers
   dependem de auth.uid()), nunca o service_role. A autorização é dupla: RLS no
   banco (is_high_school_writer / is_manager) e requireCan() aqui, para dar
   mensagem clara antes de tocar o banco. Consultor B2B tem hs.read mas NÃO
   hs.write — logo estas actions o bloqueiam. */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireCan } from "@/lib/auth/guards"
import { REDES_ESCOLA, TODAS_ETAPAS_HS, STATUS_ACAO_HS, TIPOS_ACAO_HS } from "@/lib/domain/high-school"

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
}

/* ─────────────────────────  ESCOLAS  ───────────────────────── */
export async function upsertSchool(form: FormData): Promise<ActionResult> {
  try {
    await requireCan("hs.write")
    const supabase = await createClient()

    const nome = s(form.get("nome"))
    if (!nome) return { ok: false, message: "Informe o nome da escola." }

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
      primary_owner_id: orNull(s(form.get("ownerId"))),
      next_action: orNull(s(form.get("proximaAcao"))),
      next_action_at: orNull(s(form.get("proximaAcaoEm"))),
      notes: orNull(s(form.get("observacoes"))),
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
    if (!input.data) return { ok: false, message: "Informe a data da ação." }
    const tipo = input.tipo || "Outra"
    if (!TIPOS_ACAO_HS.includes(tipo as (typeof TIPOS_ACAO_HS)[number]))
      return { ok: false, message: "Tipo de ação inválido." }
    const status = input.status || "agendada"
    if (!STATUS_ACAO_HS.includes(status as (typeof STATUS_ACAO_HS)[number]))
      return { ok: false, message: "Status inválido." }

    const { data: actor } = await supabase.auth.getUser()
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

    let acaoId = input.id
    if (acaoId) {
      const { error } = await supabase.from("school_actions").update(payload).eq("id", acaoId)
      if (error) return { ok: false, message: `Falha ao salvar ação: ${error.message}` }
    } else {
      const { data: row, error } = await supabase
        .from("school_actions")
        .insert({ ...payload, created_by: actor.user?.id ?? null })
        .select("id")
        .single()
      if (error || !row) return { ok: false, message: `Falha ao criar ação: ${error?.message ?? "?"}` }
      acaoId = String(row.id)
    }

    // participantes: substitui o conjunto (N:N real)
    const parts = (input.participantes ?? []).filter((p) => p.userId)
    await supabase.from("school_action_participants").delete().eq("school_action_id", acaoId)
    if (parts.length > 0) {
      const { error: pErr } = await supabase.from("school_action_participants").insert(
        parts.map((p) => ({
          school_action_id: acaoId,
          user_id: p.userId,
          role_in_action: p.papelNaAcao || null,
        })),
      )
      if (pErr) return { ok: false, message: `Falha ao salvar participantes: ${pErr.message}` }
    }

    // resultados por série: valida elegibilidade lendo grade_levels
    const resultados = (input.resultados ?? []).filter((r) => r.serie)
    await supabase.from("school_action_grade_results").delete().eq("school_action_id", acaoId)
    if (resultados.length > 0) {
      const { data: grades } = await supabase
        .from("grade_levels")
        .select("code,supervest_eligible")
      const elig = new Map((grades ?? []).map((g) => [String(g.code), Boolean(g.supervest_eligible)]))

      const linhas = resultados.map((r) => {
        const eligivel = elig.get(r.serie) ?? false
        const leads = Math.max(0, Number(r.leads ?? 0) || 0)
        // Série não elegível → inscrições forçadas a 0 (também no banco via trigger).
        const insc = eligivel ? Math.max(0, Number(r.inscricoesSupervest ?? 0) || 0) : 0
        return {
          school_action_id: acaoId,
          grade: r.serie,
          classes_count: r.turmas ?? null,
          estimated_impacted: r.impactados ?? null,
          leads,
          supervest_registrations: insc,
        }
      })
      const { error: rErr } = await supabase.from("school_action_grade_results").insert(linhas)
      if (rErr) return { ok: false, message: `Falha ao salvar resultados: ${rErr.message}` }
    }

    // ação realizada atualiza "última ação" da escola
    if (status === "realizada") {
      await supabase.from("schools").update({ last_action_at: input.data }).eq("id", input.escolaId)
    }

    revalidarHS()
    revalidatePath(`/high-school/escolas/${input.escolaId}`)
    return { ok: true, message: "Ação salva.", id: acaoId }
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
    const { error } = await supabase.from("school_actions").update({ status }).eq("id", id)
    if (error) return { ok: false, message: `Falha ao atualizar: ${error.message}` }
    revalidarHS()
    if (escolaId) revalidatePath(`/high-school/escolas/${escolaId}`)
    return { ok: true, message: "Status atualizado." }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro inesperado." }
  }
}

export async function deleteAction(id: string, escolaId?: string): Promise<ActionResult> {
  try {
    await requireCan("hs.write")
    const supabase = await createClient()
    const { error } = await supabase.from("school_actions").delete().eq("id", id)
    if (error) return { ok: false, message: `Falha ao remover: ${error.message}` }
    revalidarHS()
    if (escolaId) revalidatePath(`/high-school/escolas/${escolaId}`)
    return { ok: true, message: "Ação removida." }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro inesperado." }
  }
}
