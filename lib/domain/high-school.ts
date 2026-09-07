/* ─────────────────────────  domínio High School  ─────────────────────────
   Tipos, constantes e regras puras do módulo de relacionamento com escolas.
   Sem estado nem React: mapeamento snake_case↔camelCase e a fila de prioridade
   ("construirFilaHS") espelham o padrão do B2B (lib/domain/pipeline.ts). */

import { diffDias } from "./utils"

/* ── pipeline de relacionamento (NÃO é o ciclo do SuperVest) ── */
export const ETAPAS_HS = [
  "Mapeada",
  "Contato iniciado",
  "Gestor identificado",
  "Reunião agendada",
  "Relacionamento em desenvolvimento",
  "Relacionamento ativo",
  "Escola estratégica",
] as const

export const ETAPAS_HS_COMPLEMENTARES = [
  "Sem retorno",
  "Retomar futuramente",
  "Relacionamento pausado",
  "Sem potencial",
] as const

export const TODAS_ETAPAS_HS = [...ETAPAS_HS, ...ETAPAS_HS_COMPLEMENTARES]

/** Etapas em que a escola é considerada "em relacionamento ativo". */
export const ETAPAS_HS_ATIVAS = ["Relacionamento ativo", "Escola estratégica"]

/* Redes (referência extensível — nunca enum de banco). */
export const REDES_ESCOLA = ["Estadual", "Municipal", "Federal", "Particular", "ETEC", "Outra"] as const

/* Tipos de ação — espelham o seed de referência do spec. */
export const TIPOS_ACAO_HS = [
  "Visita de relacionamento",
  "Reunião com direção",
  "Reunião com coordenação",
  "Palestra de profissões",
  "Feira de profissões",
  "Sala a sala",
  "Intervalo",
  "Orientação profissional",
  "Café com os Pais",
  "Simulado",
  "Entrega de material",
  "Divulgação SuperVestibular",
  "Ação de captação",
  "Outra",
] as const

export const STATUS_ACAO_HS = ["agendada", "confirmada", "realizada", "cancelada", "reagendada"] as const
export type StatusAcaoHS = (typeof STATUS_ACAO_HS)[number]

export const POTENCIAIS_HS = ["Alto", "Médio", "Baixo"] as const
export const CLASSIFICACOES_HS = ["Estratégica", "Prioritária", "Regular", "Sem potencial"] as const

/** Ações que contam como "divulgação SuperVest" para regras da fila. */
export const ACOES_SUPERVEST = ["Divulgação SuperVestibular", "Ação de captação"]

/* ─────────────────────────  tipos de domínio  ───────────────────────── */
export interface GradeLevel {
  code: string
  label: string
  sortOrder: number
  supervestEligible: boolean
  active: boolean
}

export interface ContatoEscola {
  id: string
  escolaId: string
  nome: string
  papel?: string
  telefone?: string
  whatsapp?: string
  email?: string
  principal: boolean
  observacoes?: string
}

export interface EstimativaSerie {
  id: string
  escolaId: string
  anoLetivo: number
  serie: string
  estimativaAlunos: number | null
  numTurmas: number | null
}

export interface ResultadoSerie {
  id?: string
  acaoId?: string
  serie: string
  turmas: number | null
  impactados: number | null
  leads: number
  inscricoesSupervest: number
}

export interface ParticipanteAcao {
  userId: string
  nome?: string
  papelNaAcao?: string
}

export interface AcaoEscola {
  id: string
  escolaId: string
  escolaNome?: string
  data: string
  inicio?: string | null
  fim?: string | null
  tipo: string
  objetivo?: string
  supervestCicloId?: string | null
  comercialCicloId?: string | null
  status: StatusAcaoHS
  estimativaAlunos?: number | null
  estimativaTurmas?: number | null
  observacoes?: string
  resultadoObs?: string
  primaryOwnerId?: string | null
  participantes: ParticipanteAcao[]
  resultados: ResultadoSerie[]
  createdAt?: string
  updatedAt?: string
}

export interface Escola {
  id: string
  nome: string
  inep?: string | null
  cnpj?: string | null
  rede: string
  cidade?: string
  bairro?: string
  logradouro?: string
  numero?: string
  complemento?: string
  cep?: string
  latitude?: number | null
  longitude?: number | null
  telefone?: string
  email?: string
  site?: string
  instagram?: string
  etapa: string
  status?: string
  potencial?: string
  classificacao?: string
  primaryOwnerId?: string | null
  ultimaAcaoEm?: string | null
  proximaAcao?: string | null
  proximaAcaoEm?: string | null
  observacoes?: string
  createdBy?: string | null
  createdAt?: string
  updatedAt?: string
}

/* ─────────────────────────  mapeadores snake→camel  ───────────────────────── */
export function mapGradeRow(r: Record<string, unknown>): GradeLevel {
  return {
    code: String(r.code),
    label: String(r.label),
    sortOrder: Number(r.sort_order ?? 0),
    supervestEligible: Boolean(r.supervest_eligible),
    active: Boolean(r.active),
  }
}

export function mapEscolaRow(r: Record<string, unknown>): Escola {
  return {
    id: String(r.id),
    nome: String(r.name ?? ""),
    inep: (r.inep_code as string) ?? null,
    cnpj: (r.cnpj as string) ?? null,
    rede: String(r.network_type ?? "Outra"),
    cidade: (r.cidade as string) ?? "",
    bairro: (r.bairro as string) ?? "",
    logradouro: (r.logradouro as string) ?? "",
    numero: (r.numero as string) ?? "",
    complemento: (r.complemento as string) ?? "",
    cep: (r.cep as string) ?? "",
    latitude: r.latitude == null ? null : Number(r.latitude),
    longitude: r.longitude == null ? null : Number(r.longitude),
    telefone: (r.phone as string) ?? "",
    email: (r.email as string) ?? "",
    site: (r.website as string) ?? "",
    instagram: (r.instagram as string) ?? "",
    etapa: String(r.relationship_stage ?? "Mapeada"),
    status: (r.relationship_status as string) ?? "",
    potencial: (r.potential as string) ?? "",
    classificacao: (r.classification as string) ?? "",
    primaryOwnerId: (r.primary_owner_id as string) ?? null,
    ultimaAcaoEm: (r.last_action_at as string) ?? null,
    proximaAcao: (r.next_action as string) ?? "",
    proximaAcaoEm: (r.next_action_at as string) ?? null,
    observacoes: (r.notes as string) ?? "",
    createdBy: (r.created_by as string) ?? null,
    createdAt: (r.created_at as string) ?? "",
    updatedAt: (r.updated_at as string) ?? "",
  }
}

export function mapContatoRow(r: Record<string, unknown>): ContatoEscola {
  return {
    id: String(r.id),
    escolaId: String(r.school_id),
    nome: String(r.name ?? ""),
    papel: (r.role as string) ?? "",
    telefone: (r.phone as string) ?? "",
    whatsapp: (r.whatsapp as string) ?? "",
    email: (r.email as string) ?? "",
    principal: Boolean(r.is_primary),
    observacoes: (r.notes as string) ?? "",
  }
}

export function mapEstimativaRow(r: Record<string, unknown>): EstimativaSerie {
  return {
    id: String(r.id),
    escolaId: String(r.school_id),
    anoLetivo: Number(r.academic_year),
    serie: String(r.grade),
    estimativaAlunos: r.estimated_students == null ? null : Number(r.estimated_students),
    numTurmas: r.number_of_classes == null ? null : Number(r.number_of_classes),
  }
}

export function mapResultadoRow(r: Record<string, unknown>): ResultadoSerie {
  return {
    id: String(r.id),
    acaoId: String(r.school_action_id),
    serie: String(r.grade),
    turmas: r.classes_count == null ? null : Number(r.classes_count),
    impactados: r.estimated_impacted == null ? null : Number(r.estimated_impacted),
    leads: Number(r.leads ?? 0),
    inscricoesSupervest: Number(r.supervest_registrations ?? 0),
  }
}

export function mapAcaoRow(
  r: Record<string, unknown>,
  participantes: ParticipanteAcao[] = [],
  resultados: ResultadoSerie[] = [],
): AcaoEscola {
  return {
    id: String(r.id),
    escolaId: String(r.school_id),
    escolaNome: (r.school_name as string) ?? undefined,
    data: String(r.action_date ?? ""),
    inicio: (r.start_time as string) ?? null,
    fim: (r.end_time as string) ?? null,
    tipo: String(r.action_type ?? "Outra"),
    objetivo: (r.objective as string) ?? "",
    supervestCicloId: (r.supervest_cycle_id as string) ?? null,
    comercialCicloId: (r.commercial_cycle_id as string) ?? null,
    status: (String(r.status ?? "agendada") as StatusAcaoHS),
    estimativaAlunos: r.estimated_students == null ? null : Number(r.estimated_students),
    estimativaTurmas: r.estimated_classes == null ? null : Number(r.estimated_classes),
    observacoes: (r.notes as string) ?? "",
    resultadoObs: (r.result_notes as string) ?? "",
    primaryOwnerId: (r.primary_owner_id as string) ?? null,
    participantes,
    resultados,
    createdAt: (r.created_at as string) ?? "",
    updatedAt: (r.updated_at as string) ?? "",
  }
}

/* ─────────────────────────  fila de prioridade HS  ─────────────────────────
   Mesma mecânica de peso do B2B: cada escola vira no máximo um item, motivos
   acumulam e o maior peso define o nível. Ordenada por peso decrescente. */
export type NivelHS = "critico" | "hoje" | "atencao"

export interface ItemFilaHS {
  escola: Escola
  motivos: string[]
  peso: number
  nivel: NivelHS
}

const LIMITE_SEM_ACAO: Record<string, number> = {
  Estratégica: 21,
  Prioritária: 30,
  Regular: 45,
}

export interface FilaHSEntrada {
  escolas: Escola[]
  acoes: AcaoEscola[]
  /** codes de série elegíveis ao SuperVest (grade_levels.supervest_eligible). */
  seriesElegiveis: string[]
  /** escolaId → codes de série estimadas (para regra "tem 3ª série"). */
  seriesPorEscola: Record<string, string[]>
  hoje: string
}

export function construirFilaHS({
  escolas,
  acoes,
  seriesElegiveis,
  seriesPorEscola,
  hoje,
}: FilaHSEntrada): ItemFilaHS[] {
  const mapa = new Map<string, ItemFilaHS>()
  const push = (e: Escola, motivo: string, peso: number, nivel: NivelHS) => {
    const atual = mapa.get(e.id)
    if (!atual) mapa.set(e.id, { escola: e, motivos: [motivo], peso, nivel })
    else {
      atual.motivos.push(motivo)
      if (peso > atual.peso) {
        atual.peso = peso
        atual.nivel = nivel
      }
    }
  }

  const elegiveis = new Set(seriesElegiveis)
  const acoesPorEscola = new Map<string, AcaoEscola[]>()
  for (const a of acoes) {
    const arr = acoesPorEscola.get(a.escolaId) ?? []
    arr.push(a)
    acoesPorEscola.set(a.escolaId, arr)
  }

  for (const e of escolas) {
    if (["Sem potencial"].includes(e.classificacao || "") || e.etapa === "Sem potencial") continue
    if (["Sem retorno", "Relacionamento pausado"].includes(e.etapa || "")) continue

    const doEscola = acoesPorEscola.get(e.id) ?? []

    // follow-up atrasado (próxima ação vencida)
    if (e.proximaAcaoEm) {
      const atraso = diffDias(e.proximaAcaoEm, hoje)
      if (atraso !== null && atraso > 0)
        push(e, `Follow-up atrasado há ${atraso} ${atraso > 1 ? "dias" : "dia"}`, 200 + atraso, "critico")
      else if (atraso === 0) push(e, "Follow-up marcado para hoje", 160, "hoje")
    }

    // escola ativa sem próxima ação definida
    if (ETAPAS_HS_ATIVAS.includes(e.etapa || "") && !e.proximaAcaoEm) {
      push(e, "Escola em relacionamento sem próximo passo", 150, "hoje")
    }

    // escola estratégica há muito sem ação
    const limite = LIMITE_SEM_ACAO[e.classificacao || "Regular"] ?? 45
    const semAcao = e.ultimaAcaoEm ? diffDias(e.ultimaAcaoEm, hoje) : null
    if (e.classificacao === "Estratégica" && (semAcao === null || semAcao > limite)) {
      push(
        e,
        semAcao === null ? "Escola estratégica ainda sem ação registrada" : `Escola estratégica há ${semAcao} dias sem ação`,
        190,
        "critico",
      )
    } else if (semAcao !== null && semAcao > limite) {
      push(e, `${semAcao} dias sem ação`, 70, "atencao")
    }

    // alto potencial pouco trabalhada
    if (e.potencial === "Alto" && doEscola.length === 0) {
      push(e, "Alto potencial ainda pouco trabalhada", 120, "hoje")
    }

    // ação de amanhã ainda não confirmada
    for (const a of doEscola) {
      const faltam = a.data ? diffDias(hoje, a.data) : null
      if (faltam === 1 && a.status === "agendada") {
        push(e, `Ação amanhã (${a.tipo}) ainda não confirmada`, 210, "critico")
      }
    }

    // escola com série elegível e nenhuma divulgação SuperVest agendada/realizada
    const series = seriesPorEscola[e.id] ?? []
    const temElegivel = series.some((s) => elegiveis.has(s))
    if (temElegivel) {
      const temDivulgacao = doEscola.some(
        (a) => ACOES_SUPERVEST.includes(a.tipo) && a.status !== "cancelada",
      )
      if (!temDivulgacao) {
        push(e, "Tem série elegível e nenhuma divulgação SuperVest agendada", 140, "hoje")
      }
    }
  }

  return [...mapa.values()].sort((a, b) => b.peso - a.peso)
}

/* util de rótulo/estilo de etapa para os chips do pipeline */
export const CORES_ETAPA_HS: Record<string, string> = {
  Mapeada: "bg-sky-50 text-sky-800 border-sky-200",
  "Contato iniciado": "bg-cyan-50 text-cyan-800 border-cyan-200",
  "Gestor identificado": "bg-teal-50 text-teal-800 border-teal-200",
  "Reunião agendada": "bg-indigo-50 text-indigo-800 border-indigo-200",
  "Relacionamento em desenvolvimento": "bg-violet-50 text-violet-800 border-violet-200",
  "Relacionamento ativo": "bg-emerald-50 text-emerald-800 border-emerald-200",
  "Escola estratégica": "bg-amber-100 text-amber-900 border-amber-300",
  "Sem retorno": "bg-slate-100 text-slate-500 border-slate-200",
  "Retomar futuramente": "bg-slate-100 text-slate-600 border-slate-300",
  "Relacionamento pausado": "bg-slate-100 text-slate-500 border-slate-200",
  "Sem potencial": "bg-slate-100 text-slate-400 border-slate-200",
}

export const CORES_STATUS_ACAO: Record<StatusAcaoHS, string> = {
  agendada: "bg-sky-50 text-sky-800 border-sky-200",
  confirmada: "bg-indigo-50 text-indigo-800 border-indigo-200",
  realizada: "bg-emerald-50 text-emerald-800 border-emerald-200",
  cancelada: "bg-slate-100 text-slate-500 border-slate-200",
  reagendada: "bg-amber-100 text-amber-900 border-amber-300",
}
