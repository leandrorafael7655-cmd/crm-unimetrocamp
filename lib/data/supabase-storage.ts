import type { SupabaseClient } from "@supabase/supabase-js"
import type { StorageBackend } from "./storage-context"
import { CHAVES, CONFIG_PADRAO } from "@/lib/domain/constants"
import type { Atividade, Config, Contato, Convenio, Empresa, Pessoa, Usuario } from "@/lib/domain/types"
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
  roleDePapel,
} from "./mapping"

const projContato = (c: Contato) =>
  JSON.stringify([c.nome || "", c.papel || "", c.cargo || "", c.telefone || "", c.email || ""])
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
    if (error) console.error(`[v0] supabase-storage ${ctx}:`, error)
  }

  async function carregarProfiles(): Promise<Pessoa[]> {
    const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: true })
    log("profiles", error)
    profiles = (data || []).map(rowToPessoa)
    return profiles
  }

  function resolveOwner(e: Empresa): string | null {
    if (e.ownerId) return e.ownerId
    const porNome = profiles.find((p) => p.nome === e.consultor)
    if (porNome?.id) return porNome.id
    return perfil.id ?? null
  }

  async function carregarEmpresas(): Promise<Empresa[]> {
    const [{ data: comp, error: e1 }, { data: cont, error: e2 }, { data: agr, error: e3 }] = await Promise.all([
      supabase.from("companies").select("*").order("created_at", { ascending: true }),
      supabase.from("company_contacts").select("*").order("position", { ascending: true }),
      supabase.from("agreements").select("*"),
    ])
    log("companies", e1)
    log("company_contacts", e2)
    log("agreements", e3)
    const contatosPor: Record<string, Contato[]> = {}
    for (const c of cont || []) (contatosPor[c.company_id] ||= []).push(rowToContato(c))
    const convPor: Record<string, Convenio> = {}
    for (const a of agr || []) convPor[a.company_id] = rowToConvenio(a)
    const empresas = (comp || []).map((row: any) =>
      rowToEmpresa(row, contatosPor[row.id] || [], convPor[row.id] || null),
    )
    snapEmpresas = empresas
    return empresas
  }

  async function salvarEmpresas(novo: Empresa[]): Promise<void> {
    if (!profiles.length) await carregarProfiles()
    const prev = snapEmpresas
    const prevById = new Map(prev.map((e) => [e.id, e]))
    const nextById = new Map(novo.map((e) => [e.id, e]))

    // remoções (cascade remove contatos + convênio)
    for (const e of prev) {
      if (!nextById.has(e.id)) {
        const { error } = await supabase.from("companies").delete().eq("id", e.id)
        log("delete company", error)
      }
    }

    for (const e of novo) {
      const antes = prevById.get(e.id)
      if (!antes) {
        // inserção
        const { error } = await supabase.from("companies").insert(empresaToRow(e, resolveOwner))
        log("insert company", error)
        if (!error) {
          if (e.contatos?.length) {
            const rows = e.contatos.map((c, i) => contatoToRow(c, e.id, i))
            log("insert contatos", (await supabase.from("company_contacts").insert(rows)).error)
          }
          if (e.convenio && e.convenio.ativo) {
            log(
              "insert convenio",
              (await supabase.from("agreements").upsert(convenioToRow(e.convenio, e.id), { onConflict: "company_id" }))
                .error,
            )
          }
        }
        continue
      }
      // atualização de campos escalares
      if (!empresaScalarIgual(antes, e)) {
        const row = empresaToRow(e, resolveOwner)
        delete (row as any).id
        const { error } = await supabase.from("companies").update(row).eq("id", e.id)
        log("update company", error)
      }
      // contatos: substitui em bloco quando muda (contatos não têm id estável)
      if (!contatosIguais(antes.contatos, e.contatos)) {
        log("delete contatos", (await supabase.from("company_contacts").delete().eq("company_id", e.id)).error)
        if (e.contatos?.length) {
          const rows = e.contatos.map((c, i) => contatoToRow(c, e.id, i))
          log("reinsert contatos", (await supabase.from("company_contacts").insert(rows)).error)
        }
      }
      // convênio
      if (projConvenio(antes.convenio) !== projConvenio(e.convenio)) {
        if (!e.convenio) {
          log("delete convenio", (await supabase.from("agreements").delete().eq("company_id", e.id)).error)
        } else {
          log(
            "upsert convenio",
            (await supabase.from("agreements").upsert(convenioToRow(e.convenio, e.id), { onConflict: "company_id" }))
              .error,
          )
        }
      }
    }
    snapEmpresas = novo
  }

  async function salvarAtividades(novo: Atividade[]): Promise<void> {
    const prevIds = new Set(snapAtividades.map((a) => a.id))
    const nextIds = new Set(novo.map((a) => a.id))
    const inserir = novo.filter((a) => !prevIds.has(a.id))
    const remover = snapAtividades.filter((a) => !nextIds.has(a.id)).map((a) => a.id)
    if (inserir.length) {
      log("insert atividades", (await supabase.from("activities").insert(inserir.map(atividadeToRow))).error)
    }
    for (const id of remover) {
      log("delete atividade", (await supabase.from("activities").delete().eq("id", id)).error)
    }
    snapAtividades = novo
  }

  async function salvarEquipe(nova: Pessoa[]): Promise<void> {
    if (!profiles.length) await carregarProfiles()
    const atualById = new Map(profiles.map((p) => [p.id, p]))
    for (const p of nova) {
      if (!p.id) continue // não é possível criar conta de auth a partir daqui
      const antes = atualById.get(p.id)
      if (!antes) continue
      const mudou =
        antes.nome !== p.nome || antes.tag !== p.tag || antes.papel !== p.papel || antes.ativo !== p.ativo
      if (mudou) {
        const { error } = await supabase
          .from("profiles")
          .update({
            full_name: p.nome,
            consultant_tag: p.tag || null,
            role: roleDePapel(p.papel),
            active: p.ativo !== false,
          })
          .eq("id", p.id)
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
    async get(chave: string) {
      try {
        if (chave === CHAVES.empresas) return { value: JSON.stringify(await carregarEmpresas()) }
        if (chave === CHAVES.atividades) {
          const { data, error } = await supabase.from("activities").select("*").order("data", { ascending: false })
          log("select activities", error)
          snapAtividades = (data || []).map(rowToAtividade)
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
        log("get " + chave, e)
        return { value: null }
      }
    },
    async set(chave: string, valorJSON: string) {
      try {
        const valor = JSON.parse(valorJSON)
        if (chave === CHAVES.empresas) await salvarEmpresas(valor as Empresa[])
        else if (chave === CHAVES.atividades) await salvarAtividades(valor as Atividade[])
        else if (chave === CHAVES.equipe) await salvarEquipe(valor as Pessoa[])
        else if (chave === CHAVES.config) await salvarConfig(valor as Config)
        // usuario: logout é tratado por aoSair; ignoramos aqui
        return true
      } catch (e) {
        log("set " + chave, e)
        return false
      }
    },
  }
}
