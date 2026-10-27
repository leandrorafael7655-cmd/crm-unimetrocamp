import { readAllRows } from "./pagination"
import { cnpjValido } from "@/lib/domain/utils"
import { validateSchedule } from "@/lib/domain/validation"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { StorageBackend } from "./storage-context"
import { CHAVES, CONFIG_PADRAO } from "@/lib/domain/constants"
import type { Atividade, Config, Contato, Convenio, Empresa, Pessoa, Usuario } from "@/lib/domain/types"
import { flushCalendarQueue } from "@/lib/calendar/calendar-dispatch"
import {
  atividadeToRow,
  CAMPOS_EMPRESA,
  contatoToRow,
  convenioToRow,
  empresaToRow,
  rowToAtividade,
  rowToConvenio,
  rowToContato,
  rowToEmpresa,
  rowToPessoa,
} from "./mapping"

const projContato = (c: Contato) =>
  JSON.stringify([c.id || "", c.nome || "", c.papel || "", c.cargo || "", c.telefone || "", c.email || "", c.observacoes || "", !!c.isPrimary])
const contatosIguais = (a: Contato[] = [], b: Contato[] = []) =>
  a.length === b.length && a.every((c, i) => projContato(c) === projContato(b[i]))

const projConvenio = (cv: Convenio | null) =>
  cv
    ? JSON.stringify([
        cv.ativo,
        cv.status,
        cv.dataInicio,
        cv.percentual,
        cv.cursos,
        cv.modalidades,
        cv.dependentes,
        cv.contrapartidas,
        cv.responsavelAssinatura,
        cv.contrato,
        cv.ultimaDivulgacao,
        cv.inscricoes,
        cv.matriculasFinanceiras,
        cv.matriculasAcademicas,
        cv.observacoes,
      ])
    : "null"

const empresaScalarIgual = (a: Empresa, b: Empresa) => CAMPOS_EMPRESA.every((k) => (a[k] ?? "") === (b[k] ?? ""))

export function makeSupabaseStorage(supabase: SupabaseClient, perfil: Usuario): StorageBackend {
  let snapEmpresas: Empresa[] = []
  let snapAtividades: Atividade[] = []
  let profiles: Pessoa[] = []

  const log = (ctx: string, error: unknown) => {
    if (error) throw new Error((error as {message?: string}).message || `Não foi possível concluir ${ctx}.`)
  }

  async function dispatchCalendarBestEffort() {
    const result = await flushCalendarQueue(supabase, { batches: 2, limit: 25 })
    if (result.error) log("calendar dispatch", result.error)
  }

  async function carregarProfiles(): Promise<Pessoa[]> {
    const data = await readAllRows((from,to) => supabase.from("profiles").select("*").order("created_at", { ascending: true }).order("id").range(from,to))
    profiles = (data || []).map(rowToPessoa)
    return profiles
  }

  function operationalNameFor(userId?: string | null, fallback = "") {
    if (!userId) return fallback
    return profiles.find((p) => p.id === userId)?.nome || fallback
  }

  function resolveOwner(e: Empresa): string | null {
    if (Object.prototype.hasOwnProperty.call(e, "ownerId")) return e.ownerId ?? null
    const porNome = profiles.find((p) => p.nome === e.consultor)
    if (porNome?.id) return porNome.id
    return perfil.id ?? null
  }

  async function carregarEmpresas(): Promise<Empresa[]> {
    if (!profiles.length) await carregarProfiles()
    const [comp,cont,agr] = await Promise.all([
      readAllRows((from,to) => supabase.from("b2b_company_portfolio").select("*").order("created_at").order("id").range(from,to)),
      readAllRows((from,to) => supabase.from("company_contacts").select("*").order("position").order("id").range(from,to)),
      readAllRows((from,to) => supabase.from("agreements").select("*").order("id").range(from,to)),
    ])
    const contatosPor: Record<string, Contato[]> = {}
    for (const c of cont || []) (contatosPor[c.company_id] ||= []).push(rowToContato(c))
    const convPor: Record<string, Convenio> = {}
    for (const a of agr || []) convPor[a.company_id] = rowToConvenio(a)
    const empresas = (comp || []).map((row: any) => {
      const empresa = rowToEmpresa(row, contatosPor[row.id] || [], convPor[row.id] || null)
      empresa.portfolio = row
      if (!empresa.ownerId) empresa.consultor = "Sem responsável"
      if (empresa.ownerId) empresa.consultor = operationalNameFor(empresa.ownerId, empresa.consultor)
      return empresa
    })
    snapEmpresas = empresas
    return empresas
  }

  async function salvarEmpresas(novo: Empresa[]): Promise<void> {
    if (!profiles.length) await carregarProfiles()
    const prev = snapEmpresas
    const prevById = new Map(prev.map((e) => [e.id, e]))
    const nextById = new Map(novo.map((e) => [e.id, e]))
    let changed = false
    for (const e of prev) {
      if (!nextById.has(e.id)) {
        const { error } = await supabase.rpc("save_b2b_company_atomic", {
          p_company: { id: e.id }, p_contacts: [], p_agreement: null, p_delete: true,
        })
        log("excluir empresa",error)
        changed = true
      }
    }
    for (const e of novo) {
      const before = prevById.get(e.id)
      if (before && empresaScalarIgual(before,e) && contatosIguais(before.contatos,e.contatos) && projConvenio(before.convenio)===projConvenio(e.convenio)) continue
      if (e.cnpj && !cnpjValido(e.cnpj)) throw new Error("CNPJ inválido.")
      if (e.dataProximaAcao) {
        const invalid = validateSchedule(e.dataProximaAcao,e.proximaAcaoInicio,e.proximaAcaoFim)
        if (invalid) throw new Error(invalid)
      }
      const { error } = await supabase.rpc("save_b2b_company_atomic", {
        p_company: empresaToRow(e,resolveOwner),
        p_contacts: (e.contatos || []).map((c,i) => contatoToRow(c,e.id,i)),
        p_agreement: e.convenio ? convenioToRow(e.convenio,e.id) : null,
        p_delete: false, p_create: !before,
      })
      log("salvar empresa",error)
      changed = true
    }
    snapEmpresas = novo
    if (changed) { try { await dispatchCalendarBestEffort() } catch { /* Committed data is independent of email delivery. */ } }
  }

  async function salvarAtividades(novo: Atividade[]): Promise<void> {
    const prevIds = new Set(snapAtividades.map((a) => a.id))
    const nextIds = new Set(novo.map((a) => a.id))
    const inserir = novo.filter((a) => !prevIds.has(a.id))
    const remover = snapAtividades.filter((a) => !a.meetingType && !nextIds.has(a.id)).map((a) => a.id)
    if (inserir.length) {
      log("insert atividades", (await supabase.from("activities").insert(inserir.map(atividadeToRow))).error)
    }
    for (const id of remover) {
      log("delete atividade", (await supabase.from("activities").delete().eq("id", id).select("id").single()).error)
    }
    snapAtividades = novo
  }

  async function salvarEquipe(nova: Pessoa[]): Promise<void> {
    if (!profiles.length) await carregarProfiles()
    const atualById = new Map(profiles.map((p) => [p.id, p]))
    for (const p of nova) {
      if (!p.id) continue
      const antes = atualById.get(p.id)
      if (!antes) continue
      const mudou = antes.tag !== p.tag || antes.papel !== p.papel || antes.ativo !== p.ativo
      if (mudou) {
        if (antes.papel !== p.papel || antes.ativo !== p.ativo) throw new Error("Altere perfil e status na Gestão de usuários.")
        const { error } = await supabase
          .from("profiles")
          .update({ consultant_tag: p.tag || null })
          .eq("id", p.id)
          .select("id").single()
        log("update profile", error)
      }
    }
    await carregarProfiles()
  }

  async function salvarConfig(cfg: Config): Promise<void> {
    const { error } = await supabase.from("app_settings").upsert(
      {
        id: 1,
        nome_unidade: cfg.nomeUnidade,
        logo_url: cfg.logoUrl || null,
        cor_primaria: cfg.corPrimaria,
        cor_rail: cfg.corRail,
        cor_suave: cfg.corSuave,
        cor_alerta: cfg.corAlerta,
        cor_atencao: cfg.corAtencao,
        link_base: cfg.linkBase || null,
        param_consultor: cfg.paramConsultor,
        param_empresa: cfg.paramEmpresa,
        incluir_empresa: cfg.incluirEmpresa,
        empresa_chave: cfg.empresaChave,
        utm: cfg.utm,
      },
      { onConflict: "id" },
    )
    log("upsert app_settings", error)
  }

  async function carregarConfig(): Promise<Config> {
    const { data, error } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle()
    log("select app_settings", error)
    if (!data) return CONFIG_PADRAO
    return {
      nomeUnidade: data.nome_unidade || CONFIG_PADRAO.nomeUnidade,
      logoUrl: data.logo_url || "",
      corPrimaria: data.cor_primaria || CONFIG_PADRAO.corPrimaria,
      corRail: data.cor_rail || CONFIG_PADRAO.corRail,
      corSuave: data.cor_suave || CONFIG_PADRAO.corSuave,
      corAlerta: data.cor_alerta || CONFIG_PADRAO.corAlerta,
      corAtencao: data.cor_atencao || CONFIG_PADRAO.corAtencao,
      linkBase: data.link_base || "",
      paramConsultor: data.param_consultor || "consultor",
      paramEmpresa: data.param_empresa || "empresa",
      incluirEmpresa: data.incluir_empresa !== false,
      empresaChave: data.empresa_chave || "cnpj",
      utm: data.utm !== false,
    }
  }

  return {
    mode: "supabase",
    async saveInteraction(activity: Atividade, company: Empresa) {
      const invalid = validateSchedule(activity.data)
      if (invalid) throw new Error(invalid)
      if (company.dataProximaAcao) {
        const scheduleError = validateSchedule(company.dataProximaAcao,company.proximaAcaoInicio,company.proximaAcaoFim)
        if (scheduleError) throw new Error(scheduleError)
      }
      const { error } = await supabase.rpc("save_b2b_interaction_atomic", {
        p_activity: atividadeToRow(activity), p_company: empresaToRow(company,resolveOwner),
      })
      log("registrar interação",error)
      return true
    },
    async get(chave: string) {
      try {
        if (chave === CHAVES.empresas) return { value: JSON.stringify(await carregarEmpresas()) }
        if (chave === CHAVES.atividades) {
          if (!profiles.length) await carregarProfiles()
          const data = await readAllRows((from,to) => supabase.from("b2b_activities_with_cycle").select("*").order("data", { ascending: false }).order("id").range(from,to))
          snapAtividades = (data || []).map((row: any) => {
            const atividade = rowToAtividade(row)
            if (atividade.primaryOwnerId) atividade.consultor = operationalNameFor(atividade.primaryOwnerId, atividade.consultor)
            return atividade
          })
          return { value: JSON.stringify(snapAtividades) }
        }
        if (chave === CHAVES.equipe) return { value: JSON.stringify(await carregarProfiles()) }
        if (chave === CHAVES.config) return { value: JSON.stringify(await carregarConfig()) }
        if (chave === CHAVES.usuario) {
          const u: Pessoa = { id: perfil.id, nome: perfil.nome, papel: perfil.papel, tag: perfil.tag }
          return { value: JSON.stringify(u) }
        }
        return { value: null }
      } catch (e) {
        throw e
      }
    },
    async set(chave: string, valorJSON: string) {
      try {
        const valor = JSON.parse(valorJSON)
        if (chave === CHAVES.empresas) await salvarEmpresas(valor as Empresa[])
        else if (chave === CHAVES.atividades) await salvarAtividades(valor as Atividade[])
        else if (chave === CHAVES.equipe) await salvarEquipe(valor as Pessoa[])
        else if (chave === CHAVES.config) await salvarConfig(valor as Config)
        return true
      } catch (e) {
        throw e
      }
    },
  }
}
