/* ───────────────────────────  metas e aderência  ───────────────────────────
   Domínio puro da FASE 3 (SuperVestibular, ciclos e Central de Metas).
   Sem I/O: apenas cálculo. Regras inegociáveis do projeto:

   • Semana comercial: segunda 00:00 → domingo 23:59, timezone America/Sao_Paulo.
     O Brasil aboliu o horário de verão em 2019, então o offset é fixo UTC−3.
   • Aderência de Campo = semanas atingidas ÷ semanas APLICÁVEIS × 100.
     Semana em exceção sai do denominador. Excesso não compensa déficit.
   • Anti-dupla-contagem: inscrição oficial (snapshot institucional) e inscrições
     atribuídas (HS + B2B) são grandezas DIFERENTES — nunca somar e chamar de
     oficial. "Outros canais" = oficial − atribuídas (pode ser negativo = alerta).
   • Meta geral × individual: o denominador institucional é a meta GERAL; metas
     individuais são acompanhamento e nunca somam ao geral. */

/** Offset fixo de America/Sao_Paulo (sem horário de verão desde 2019). */
const SP_OFFSET_MIN = -180 // UTC−3

export const GOAL_TYPES = {
  high_school_leads: "Leads High School",
  supervest_registrations: "Inscrições SuperVestibular",
  high_school_actions: "Ações High School",
  b2b_supervest_registrations: "Inscrições SuperVest (B2B)",
  b2b_weekly_actions: "Ações semanais B2B",
} as const
export type GoalTypeCode = keyof typeof GOAL_TYPES

export const STATUS_SUPERVEST = [
  "planejamento",
  "captacao",
  "evento_proximo",
  "evento_realizado",
  "encerrado",
  "cancelado",
] as const
export type StatusSupervest = (typeof STATUS_SUPERVEST)[number]

export const ROTULO_STATUS_SUPERVEST: Record<StatusSupervest, string> = {
  planejamento: "Planejamento",
  captacao: "Captação",
  evento_proximo: "Evento próximo",
  evento_realizado: "Evento realizado",
  encerrado: "Encerrado",
  cancelado: "Cancelado",
}

/* ─────────────────────────  semana comercial (SP)  ───────────────────────── */

/** Converte um instante para o "relógio de parede" em SP. */
function toSpWallClock(d: Date): Date {
  return new Date(d.getTime() + SP_OFFSET_MIN * 60_000)
}

/** Data (YYYY-MM-DD) da segunda-feira da semana que contém `ref`, em SP. */
export function inicioSemanaComercial(ref: Date = new Date()): string {
  const sp = toSpWallClock(ref)
  const dow = sp.getUTCDay() // 0=domingo … 1=segunda
  const diffParaSegunda = dow === 0 ? -6 : 1 - dow
  const segunda = new Date(sp)
  segunda.setUTCDate(sp.getUTCDate() + diffParaSegunda)
  return isoDate(segunda)
}

/** Domingo (YYYY-MM-DD) da semana comercial cujo início é `weekStart`. */
export function fimSemanaComercial(weekStart: string): string {
  const d = fromIsoDate(weekStart)
  d.setUTCDate(d.getUTCDate() + 6)
  return isoDate(d)
}

/** Lista os inícios de semana (segundas) de `de` até `ate`, inclusive. */
export function semanasNoIntervalo(de: string, ate: string): string[] {
  const out: string[] = []
  let cur = fromIsoDate(inicioSemanaComercial(fromIsoDate(de)))
  const fim = fromIsoDate(ate)
  while (cur.getTime() <= fim.getTime()) {
    out.push(isoDate(cur))
    cur = new Date(cur)
    cur.setUTCDate(cur.getUTCDate() + 7)
  }
  return out
}

/** Verdadeiro se `weekStart` é a semana comercial corrente (ainda aberta). */
export function isSemanaCorrente(weekStart: string, ref: Date = new Date()): boolean {
  return weekStart === inicioSemanaComercial(ref)
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function fromIsoDate(s: string): Date {
  // Interpreta como meia-noite UTC do dia (datas puras, sem fuso).
  return new Date(`${s}T00:00:00.000Z`)
}

/* ─────────────────────────  aderência de campo  ───────────────────────── */

export interface SemanaAderencia {
  weekStart: string
  appliedTarget: number
  completedActions: number
  achieved: boolean
  applicable: boolean
  exceptionReason?: string | null
}

export interface ResultadoAderencia {
  semanasAplicaveis: number
  semanasAtingidas: number
  aderenciaPct: number // 0..100
  semanasExcecao: number
}

/**
 * Aderência = atingidas ÷ aplicáveis × 100.
 * Semanas não aplicáveis (exceção) saem do denominador.
 * Cenário canônico 0,0,0,12 (todas aplicáveis, alvo 3) → 1/4 = 25%.
 */
export function calcularAderencia(semanas: SemanaAderencia[]): ResultadoAderencia {
  const aplicaveis = semanas.filter((s) => s.applicable)
  const atingidas = aplicaveis.filter((s) => s.achieved).length
  const excecao = semanas.length - aplicaveis.length
  const pct = aplicaveis.length === 0 ? 0 : Math.round((atingidas / aplicaveis.length) * 100)
  return {
    semanasAplicaveis: aplicaveis.length,
    semanasAtingidas: atingidas,
    aderenciaPct: pct,
    semanasExcecao: excecao,
  }
}

/** Uma semana é atingida quando ações concluídas ≥ meta vigente (congelada). */
export function semanaAtingida(completedActions: number, appliedTarget: number): boolean {
  return completedActions >= appliedTarget
}

/* ──────────────────────  anti-dupla-contagem SuperVest  ────────────────── */

export interface ApuracaoSupervest {
  oficial: number
  hsAtribuidas: number
  b2bAtribuidas: number
  outrosCanais: number // oficial − (hs + b2b)
  inconsistente: boolean // outrosCanais < 0
}

export function apurarSupervest(
  oficial: number,
  hsAtribuidas: number,
  b2bAtribuidas: number,
): ApuracaoSupervest {
  const atribuidas = hsAtribuidas + b2bAtribuidas
  const outros = oficial - atribuidas
  return {
    oficial,
    hsAtribuidas,
    b2bAtribuidas,
    outrosCanais: outros,
    inconsistente: outros < 0,
  }
}

/* ─────────────────────────────  progresso de meta  ───────────────────────── */

export interface ProgressoMeta {
  alvo: number
  atual: number
  atingimentoPct: number // 0..100+ (não limitado, para exibir excesso)
  faltante: number // nunca negativo
}

export function calcularProgresso(alvo: number, atual: number): ProgressoMeta {
  const pct = alvo <= 0 ? 0 : Math.round((atual / alvo) * 100)
  return {
    alvo,
    atual,
    atingimentoPct: pct,
    faltante: Math.max(0, alvo - atual),
  }
}

/* ───────────────────  mensagem escalonada por dia da semana  ─────────────── */

/**
 * Mensagem do card "Minhas ações da semana", escalando de informativo (segunda)
 * a prioridade alta (sexta+), sem notificação externa (só dentro do CRM).
 */
export function mensagemMetaSemanal(
  completed: number,
  target: number,
  ref: Date = new Date(),
): { tom: "ok" | "info" | "atencao" | "critico"; texto: string } {
  if (completed >= target) {
    return { tom: "ok", texto: `Meta da semana batida: ${completed}/${target} ações.` }
  }
  const sp = toSpWallClock(ref)
  const dow = sp.getUTCDay() // 1=segunda … 5=sexta, 0=domingo
  const faltam = target - completed
  if (dow === 1 || dow === 2) {
    return { tom: "info", texto: `Faltam ${faltam} ações para a meta desta semana. Bom começo!` }
  }
  if (dow === 3 || dow === 4) {
    return { tom: "atencao", texto: `Ainda faltam ${faltam} ações esta semana. Organize suas visitas.` }
  }
  return { tom: "critico", texto: `Prioridade alta: faltam ${faltam} ações e a semana está acabando.` }
}
