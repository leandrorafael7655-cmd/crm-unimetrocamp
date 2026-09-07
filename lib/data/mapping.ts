import type { Atividade, Contato, Convenio, Empresa, Pessoa } from "@/lib/domain/types"
import { CONVENIO_VAZIO } from "@/lib/domain/constants"

/* ─────────────  banco (snake_case)  →  domínio (camelCase)  ───────────── */

const s = (v: unknown): string => (v == null ? "" : String(v))
const dOrEmpty = (v: unknown): string => (v == null ? "" : String(v))

export function papelDeRole(role?: string): string {
  if (role === "gerente") return "Gerente"
  if (role === "supervisor") return "Supervisor"
  return "Consultor"
}

export function roleDePapel(papel?: string): string {
  if (papel === "Gerente") return "gerente"
  if (papel === "Supervisor") return "supervisor"
  return "consultor"
}

export function rowToContato(row: any): Contato {
  return {
    id: row.id,
    nome: s(row.nome),
    papel: s(row.papel),
    cargo: s(row.cargo),
    telefone: s(row.telefone),
    email: s(row.email),
  }
}

export function rowToConvenio(row: any): Convenio {
  return {
    ...CONVENIO_VAZIO,
    ativo: !!row.ativo,
    status: s(row.status) || "Ativo",
    dataInicio: dOrEmpty(row.data_inicio),
    percentual: row.percentual == null ? "" : String(row.percentual),
    cursos: s(row.cursos),
    modalidades: s(row.modalidades) || CONVENIO_VAZIO.modalidades,
    dependentes: s(row.dependentes) || CONVENIO_VAZIO.dependentes,
    contrapartidas: s(row.contrapartidas),
    responsavelAssinatura: s(row.responsavel_assinatura),
    contrato: s(row.contrato),
    ultimaDivulgacao: dOrEmpty(row.ultima_divulgacao),
    inscricoes: row.inscricoes == null ? "" : String(row.inscricoes),
    matriculasFinanceiras: row.matriculas_financeiras == null ? "" : String(row.matriculas_financeiras),
    matriculasAcademicas: row.matriculas_academicas == null ? "" : String(row.matriculas_academicas),
    observacoes: s(row.observacoes),
  }
}

export function rowToEmpresa(row: any, contatos: Contato[], convenio: Convenio | null): Empresa {
  return {
    id: row.id,
    razaoSocial: s(row.razao_social),
    nomeFantasia: s(row.nome_fantasia),
    cnpj: s(row.cnpj),
    segmento: s(row.segmento),
    colaboradores: row.colaboradores == null ? "" : String(row.colaboradores),
    cidade: s(row.cidade),
    bairro: s(row.bairro),
    telefone: s(row.telefone),
    site: s(row.site),
    origem: s(row.origem),
    classificacao: s(row.classificacao) || "Mapeada",
    etapa: s(row.etapa) || "Mapeada",
    potencial: s(row.potencial) || "Médio",
    possuiBeneficio: s(row.possui_beneficio),
    observacoes: s(row.observacoes),
    consultor: s(row.consultor),
    ownerId: row.owner_id ?? null,
    logradouro: s(row.logradouro),
    numero: s(row.numero),
    complemento: s(row.complemento),
    cep: s(row.cep),
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    geocodedAt: dOrEmpty(row.geocoded_at),
    geocodePrecision: s(row.geocode_precision),
    ultimoContato: dOrEmpty(row.ultimo_contato),
    proximaAcao: s(row.proxima_acao),
    dataProximaAcao: dOrEmpty(row.data_proxima_acao),
    dataEntrada: dOrEmpty(row.data_entrada),
    linkInscricao: s(row.link_inscricao),
    linkConsultor: s(row.link_consultor),
    contatos,
    convenio,
  }
}

export function rowToAtividade(row: any): Atividade {
  return {
    id: row.id,
    empresaId: row.company_id,
    consultor: s(row.consultor),
    data: dOrEmpty(row.data),
    tipo: s(row.tipo),
    contato: s(row.contato),
    resultado: s(row.resultado),
    observacao: s(row.observacao),
    leads: row.leads == null ? "" : String(row.leads),
    impactados: row.impactados == null ? "" : String(row.impactados),
    etapaAnterior: s(row.etapa_anterior),
    etapaNova: s(row.etapa_nova),
    proximaAcao: s(row.proxima_acao),
    dataProximoContato: dOrEmpty(row.data_proximo_contato),
    status: s(row.status) || "realizada",
    primaryOwnerId: row.primary_owner_id ?? null,
    contaMetaSemanal: row.conta_meta_semanal ?? true,
  }
}

export function rowToPessoa(row: any): Pessoa {
  return {
    id: row.id,
    nome: s(row.full_name),
    papel: papelDeRole(row.role),
    tag: s(row.consultant_tag),
    role: row.role,
    ativo: row.active !== false,
  }
}

/* ─────────────  domínio  →  banco (para inserção / atualização)  ───────────── */

const nOrNull = (v: unknown): number | null => {
  if (v === "" || v == null) return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}
const dOrNull = (v: unknown): string | null => (v ? String(v) : null)
const tOrNull = (v: unknown): string | null => {
  const t = (v == null ? "" : String(v)).trim()
  return t === "" ? null : t
}

export function empresaToRow(e: Empresa, resolveOwner: (e: Empresa) => string | null): Record<string, unknown> {
  return {
    id: e.id,
    razao_social: e.razaoSocial || "",
    nome_fantasia: e.nomeFantasia || "",
    cnpj: tOrNull(e.cnpj),
    segmento: e.segmento || null,
    colaboradores: nOrNull(e.colaboradores),
    cidade: e.cidade || null,
    bairro: e.bairro || null,
    telefone: e.telefone || null,
    site: e.site || null,
    origem: e.origem || null,
    classificacao: e.classificacao || "Mapeada",
    etapa: e.etapa || "Mapeada",
    potencial: e.potencial || "Médio",
    possui_beneficio: e.possuiBeneficio || null,
    observacoes: e.observacoes || null,
    consultor: e.consultor || null,
    owner_id: resolveOwner(e),
    logradouro: tOrNull(e.logradouro),
    numero: tOrNull(e.numero),
    complemento: tOrNull(e.complemento),
    cep: tOrNull(e.cep),
    latitude: nOrNull(e.latitude),
    longitude: nOrNull(e.longitude),
    geocoded_at: dOrNull(e.geocodedAt),
    geocode_precision: tOrNull(e.geocodePrecision),
    ultimo_contato: dOrNull(e.ultimoContato),
    proxima_acao: e.proximaAcao || null,
    data_proxima_acao: dOrNull(e.dataProximaAcao),
    data_entrada: dOrNull(e.dataEntrada),
    link_inscricao: e.linkInscricao || null,
    link_consultor: e.linkConsultor || null,
  }
}

export function contatoToRow(c: Contato, companyId: string, position: number): Record<string, unknown> {
  return {
    company_id: companyId,
    nome: c.nome || "",
    papel: c.papel || null,
    cargo: c.cargo || null,
    telefone: c.telefone || null,
    email: c.email || null,
    position,
  }
}

export function convenioToRow(cv: Convenio, companyId: string): Record<string, unknown> {
  return {
    company_id: companyId,
    ativo: cv.ativo !== false,
    status: cv.status || "Ativo",
    data_inicio: dOrNull(cv.dataInicio),
    percentual: nOrNull(cv.percentual),
    cursos: cv.cursos || null,
    modalidades: cv.modalidades || null,
    dependentes: cv.dependentes || null,
    contrapartidas: cv.contrapartidas || null,
    responsavel_assinatura: cv.responsavelAssinatura || null,
    contrato: cv.contrato || null,
    ultima_divulgacao: dOrNull(cv.ultimaDivulgacao),
    inscricoes: nOrNull(cv.inscricoes),
    matriculas_financeiras: nOrNull(cv.matriculasFinanceiras),
    matriculas_academicas: nOrNull(cv.matriculasAcademicas),
    observacoes: cv.observacoes || null,
  }
}

export function atividadeToRow(a: Atividade): Record<string, unknown> {
  return {
    id: a.id,
    company_id: a.empresaId,
    consultor: a.consultor || null,
    data: dOrNull(a.data),
    tipo: a.tipo || null,
    contato: a.contato || null,
    resultado: a.resultado || null,
    observacao: a.observacao || null,
    leads: nOrNull(a.leads),
    impactados: nOrNull(a.impactados),
    etapa_anterior: a.etapaAnterior || null,
    etapa_nova: a.etapaNova || null,
    proxima_acao: a.proximaAcao || null,
    data_proximo_contato: dOrNull(a.dataProximoContato),
    status: a.status || "realizada",
    primary_owner_id: a.primaryOwnerId ?? null,
    conta_meta_semanal: a.contaMetaSemanal ?? true,
  }
}

/* colunas escalares comparadas para detectar mudança em uma empresa */
export const CAMPOS_EMPRESA: (keyof Empresa)[] = [
  "razaoSocial",
  "nomeFantasia",
  "cnpj",
  "segmento",
  "colaboradores",
  "cidade",
  "bairro",
  "telefone",
  "site",
  "origem",
  "classificacao",
  "etapa",
  "potencial",
  "possuiBeneficio",
  "observacoes",
  "consultor",
  "ultimoContato",
  "proximaAcao",
  "dataProximaAcao",
  "linkInscricao",
  "linkConsultor",
]
