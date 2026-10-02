"use server"

import { revalidatePath } from "next/cache"
import { requireActor, requireCan, isManagerRole } from "@/lib/auth/guards"
import { can } from "@/lib/domain/roles"
import { profileDisplayName } from "@/lib/domain/user-display"
import { createClient } from "@/lib/supabase/server"
import { assertUuid } from "@/lib/meetings/domain"
import { validateCompanyAction, type CompanyActionInput, type CompanyActionRow } from "@/lib/company-actions/domain"

const columns = "id,company_id,action_type,title,occurred_at,responsible_user_id,responsible_name,description,result,notes,location,channel,promotion_url,created_by,creator_name,created_at"
const message = (error: unknown) => error instanceof Error ? error.message : "Não foi possível concluir a operação."

export async function loadCompanyActions(companyId: string) {
  try {
    assertUuid(companyId)
    const actor = await requireActor()
    if (!can(actor.role, "b2b.read.all")) throw new Error("Você não tem acesso ao histórico B2B.")
    const client = await createClient()
    const { data: company, error: companyError } = await client.from("companies").select("id,owner_id").eq("id", companyId).maybeSingle()
    if (companyError || !company) throw new Error("Empresa não encontrada.")
    const [actions, profiles] = await Promise.all([
      client.from("b2b_actions_with_cycle").select(columns + ",commercial_cycle").eq("company_id", companyId).order("occurred_at", { ascending: false }).order("created_at", { ascending: false }),
      client.from("profiles").select("id,full_name,consultant_tag,role,active").eq("active", true).in("role", ["gerente", "supervisor", "consultor_b2b", "consultor"]),
    ])
    if (actions.error || profiles.error) throw new Error("Não foi possível carregar as ações. Tente novamente.")
    const managers = isManagerRole(actor.role)
    return {
      ok: true as const,
      actions: actions.data as unknown as CompanyActionRow[],
      actor: { id: actor.id, name: actor.full_name },
      canRegister: can(actor.role, "b2b.write") && (managers || company.owner_id === actor.id),
      consultants: (profiles.data || []).filter(p => managers || p.id === actor.id)
        .map(p => ({ id: p.id, name: profileDisplayName(p) })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    }
  } catch (error) { return { ok: false as const, message: message(error) } }
}

export async function saveCompanyAction(input: CompanyActionInput) {
  try {
    const actor = await requireCan("b2b.write")
    assertUuid(input.id); assertUuid(input.companyId); assertUuid(input.responsibleUserId)
    const fields = validateCompanyAction(input)
    const client = await createClient()
    const { data: company, error: companyError } = await client.from("companies").select("id,owner_id").eq("id", input.companyId).maybeSingle()
    const manager = isManagerRole(actor.role)
    if (companyError || !company) throw new Error("Empresa não encontrada.")
    if (!manager && company.owner_id !== actor.id) throw new Error("Somente o responsável pela carteira ou a gerência pode registrar ações nesta empresa.")
    if (!manager && input.responsibleUserId !== actor.id) throw new Error("Você só pode registrar ações sob sua responsabilidade.")
    const { data: responsible, error: responsibleError } = await client.from("profiles")
      .select("id,active,role").eq("id", input.responsibleUserId).maybeSingle()
    if (responsibleError || !responsible?.active || !can(responsible.role, "b2b.write")) throw new Error("Selecione um consultor B2B ativo.")
    const payload = { id: input.id, company_id: input.companyId, responsible_user_id: input.responsibleUserId, ...fields }
    const { data, error } = await client.from("company_actions").insert(payload).select(columns).single()
    let saved = data as unknown as CompanyActionRow | null
    if (error?.code === "23505") {
      // A lost response can be retried with the same ID without duplicating history.
      const { data: existing } = await client.from("company_actions").select(columns)
        .eq("id", input.id).eq("company_id", input.companyId).eq("created_by", actor.id).maybeSingle()
      const row = existing as unknown as CompanyActionRow | null
      if (row && Object.entries(fields).every(([key, value]) => {
        const actual = row[key as keyof CompanyActionRow]
        return key === "occurred_at" ? Date.parse(String(actual)) === Date.parse(String(value)) : actual === value
      }) && row.responsible_user_id === input.responsibleUserId) saved = row
    }
    if (!saved) throw new Error("Não foi possível salvar a ação. Seus dados foram mantidos; tente novamente.")
    const cycle = await client.rpc("b2b_commercial_cycle", { p_date: input.date })
    if (!cycle.error) saved.commercial_cycle = cycle.data
    revalidatePath("/")
    revalidatePath("/b2b/carteira")
    revalidatePath("/dashboard")
    return { ok: true as const, action: saved, message: "Ação registrada no histórico da empresa." }
  } catch (error) { return { ok: false as const, message: message(error) } }
}
