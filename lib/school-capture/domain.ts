import {
  ACOES_SUPERVEST,
  TIPOS_ACAO_HS,
  STATUS_ACAO_HS,
  type Escola,
  type AcaoEscola,
  type GradeLevel,
  type ContatoEscola,
  type EstimativaSerie,
} from "@/lib/domain/high-school"
import {
  actionTimestamp,
  localActionDateTime,
} from "@/lib/company-actions/domain"

export const CAPTURE_STATES = {
  em_contato: "Em contato",
  em_negociacao: "Em negociação",
  aguardando_retorno: "Aguardando retorno",
  agendamento_conjunto: "Pronta para agendar / agendamento em conjunto",
  encerrada: "Encerrada",
} as const
export type EngagementStatus = keyof typeof CAPTURE_STATES
export interface CaptureCycle {
  id: string
  name: string
  edition: string | null
  status: string
  is_active: boolean
  capture_academic_year: number | null
  campaign_start_at: string | null
  campaign_end_at: string | null
}
export interface CampaignContact {
  id: string
  school_id: string
  supervest_cycle_id: string
  consultant_id: string
  consultant_name: string
  institutional_contact_id: string | null
  occurred_at: string
  person_name: string
  person_role: string | null
  channel: string
  description: string
  response: string | null
  negotiation_status: EngagementStatus
  next_step: string | null
  return_at: string | null
  created_by: string
  created_at: string
}
export interface CampaignEngagement {
  id: string
  school_id: string
  supervest_cycle_id: string
  user_id: string
  user_name: string
  status: EngagementStatus
  started_at: string
  updated_at: string
  ended_at: string | null
  created_by: string
}
export interface CampaignAudit {
  id: string
  school_id: string
  supervest_cycle_id: string | null
  entity: string
  operation: string
  record_id: string | null
  before_data: Record<string, unknown> | null
  after_data: Record<string, unknown> | null
  actor_name: string
  recorded_at: string
}
export interface CaptureOwner {
  id: string
  nome: string
  role: string
  active?: boolean
}
export interface CaptureData {
  cycles: CaptureCycle[]
  schools: Escola[]
  estimates: EstimativaSerie[]
  grades: GradeLevel[]
  institutionalContacts: ContatoEscola[]
  contacts: CampaignContact[]
  engagements: CampaignEngagement[]
  actions: AcaoEscola[]
  history: CampaignAudit[]
  owners: CaptureOwner[]
  officialSnapshots: {
    cycle_id: string
    snapshot_date: string
    official_registrations: number
  }[]
}
export type CaptureMetric =
  | "all"
  | "eligible"
  | "no_contact"
  | "no_engagement"
  | "negotiating"
  | "ready_to_schedule"
  | "to_schedule"
  | "scheduled"
  | "performed"
  | "pending_results"
export const CAPTURE_METRICS: { key: CaptureMetric; label: string }[] = [
  { key: "eligible", label: "Escolas elegíveis" },
  { key: "no_contact", label: "Escolas sem contato" },
  { key: "no_engagement", label: "Sem atuação atual" },
  { key: "negotiating", label: "Em contato ou negociação" },
  { key: "ready_to_schedule", label: "Prontas para agendar" },
  { key: "to_schedule", label: "Precisam de atendimento e agendamento" },
  { key: "scheduled", label: "Escolas agendadas" },
  { key: "performed", label: "Escolas atendidas" },
  { key: "pending_results", label: "Com resultados pendentes" },
]
export const CAPTURE_STATUSES = {
  no_contact: "Sem contato",
  negotiating: "Em contato / negociação",
  ready_to_schedule: "Para agendar",
  scheduled: "Agendadas / confirmadas",
  performed: "Atendidas",
} as const
export type CaptureStatus = keyof typeof CAPTURE_STATUSES
export const UNIDENTIFIED_CONSULTANT = "unidentified"
export interface CaptureAttendance {
  id: string
  name: string
  actionIds: string[]
}
export interface CaptureFilters {
  name: string
  city: string
  network: string
  classification: string
  stage: string
  actingConsultant: string
  attendingConsultant: string
  status: CaptureStatus | "all"
  from: string
  to: string
  situation: CaptureMetric
}
export const EMPTY_CAPTURE_FILTERS: CaptureFilters = {
  name: "",
  city: "",
  network: "",
  classification: "",
  stage: "",
  actingConsultant: "",
  attendingConsultant: "",
  status: "all",
  from: "",
  to: "",
  situation: "all",
}
export function selectedCaptureCycle(
  cycles: CaptureCycle[],
  requested?: string | null,
) {
  return (
    cycles.find((c) => c.id === requested) ??
    cycles.find((c) => c.is_active) ??
    cycles.find((c) => ["captacao", "evento_proximo"].includes(c.status)) ??
    cycles[0] ??
    null
  )
}
export function eligibility(
  school: Escola,
  estimates: EstimativaSerie[],
  year: number | null,
): "eligible" | "unknown" | "ineligible" {
  if (school.seriesOferecidas != null)
    return school.seriesOferecidas.includes("em3") ? "eligible" : "ineligible"
  return year &&
    estimates.some(
      (e) =>
        e.escolaId === school.id && e.anoLetivo === year && e.serie === "em3",
    )
    ? "eligible"
    : "unknown"
}
export function publicityAction(a: AcaoEscola) {
  // Contatos legados nunca representam uma ação de divulgação realizada.
  const contactTypes = [
    "ligacao",
    "telefone",
    "whatsapp",
    "e-mail",
    "email",
    "contato",
  ]
  const type = a.tipo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
  if (contactTypes.includes(type)) return false
  return Boolean(a.divulgacaoCaptacao || ACOES_SUPERVEST.includes(a.tipo))
}
export function actionAttendees(a: AcaoEscola, owners: CaptureOwner[]) {
  const people = new Map<string, { id: string; name: string }>()
  const add = (
    userId: string | null | undefined,
    snapshot: string | null | undefined,
  ) => {
    const owner = owners.find((o) => o.id === userId)
    const name = snapshot?.trim() || owner?.nome.trim()
    if (
      !name ||
      ["Usuário do histórico", "Consultor a identificar"].includes(name)
    )
      return
    // Um nome preservado no registro identifica participação histórica mesmo
    // quando a conta já foi removida. Nunca usamos o cadastrador como participante.
    const id = isUuid(userId) ? userId : `historical:${name}`
    if (!people.has(id)) people.set(id, { id, name })
  }
  add(a.primaryOwnerId, a.consultorPrincipalNome)
  for (const p of a.participantes) add(p.userId, p.nome)
  return [...people.values()]
}
export function actionHasResults(a: AcaoEscola) {
  return a.resultados.length > 0 || Boolean(a.resultadoInformadoEm)
}
export function actionStartsAt(a: AcaoEscola) {
  return actionTimestamp(a.data, a.inicio?.slice(0, 5) || "00:00")
}
export function validScheduledAction(a: AcaoEscola, now: string) {
  if (
    !(
      publicityAction(a) &&
      ["agendada", "confirmada", "reagendada"].includes(a.status) &&
      a.inicio &&
      a.fim
    )
  )
    return false
  try {
    const start = actionStartsAt(a)
    const end = actionTimestamp(a.data, a.fim.slice(0, 5))
    return end > start && start >= now
  } catch {
    return false
  }
}
function periodMatches(
  date: string,
  filters: Pick<CaptureFilters, "from" | "to">,
) {
  return (
    (!filters.from || date >= filters.from) &&
    (!filters.to || date <= filters.to)
  )
}
function dayOf(iso: string) {
  return localActionDateTime(iso).date
}
export interface SchoolCaptureSummary {
  school: Escola
  status: CaptureStatus
  eligibility: ReturnType<typeof eligibility>
  contacts: CampaignContact[]
  engagements: CampaignEngagement[]
  actions: AcaoEscola[]
  lastContact: CampaignContact | null
  lastInteraction: {
    at: string
    hasTime: boolean
    author: string
    channel: string
  } | null
  nextSteps: CampaignContact[]
  nextAction: AcaoEscola | null
  scheduled: AcaoEscola[]
  performed: AcaoEscola[]
  pendingResults: AcaoEscola[]
  alerts: string[]
  metrics: Record<CaptureMetric, boolean>
  leads: number
  pendingRegistrations: number
  registrations: number
  impacted: number | null
  attendances: CaptureAttendance[]
  unidentifiedPerformed: AcaoEscola[]
  hasMovementInPeriod: boolean
}
export function schoolCaptureSummaries(
  data: CaptureData,
  cycle: CaptureCycle,
  now: string,
  filters: Pick<CaptureFilters, "from" | "to"> = EMPTY_CAPTURE_FILTERS,
): SchoolCaptureSummary[] {
  const scopedContacts = data.contacts.filter(
    (c) => c.supervest_cycle_id === cycle.id,
  )
  const scopedEngagements = data.engagements.filter(
    (c) => c.supervest_cycle_id === cycle.id,
  )
  const scopedActions = data.actions.filter(
    (a) => a.supervestCicloId === cycle.id,
  )
  return data.schools.flatMap((school) => {
    const elig = eligibility(
      school,
      data.estimates,
      cycle.capture_academic_year,
    )
    const allContacts = scopedContacts.filter((c) => c.school_id === school.id)
    const allEngagements = scopedEngagements.filter(
      (e) => e.school_id === school.id,
    )
    const allActions = scopedActions.filter((a) => a.escolaId === school.id)
    if (
      elig === "ineligible" &&
      !allContacts.length &&
      !allEngagements.length &&
      !allActions.length
    )
      return []
    const contacts = allContacts
      .filter((c) => periodMatches(dayOf(c.occurred_at), filters))
      .sort(
        (a, b) =>
          b.occurred_at.localeCompare(a.occurred_at) ||
          b.created_at.localeCompare(a.created_at),
      )
    const engagements = allEngagements
      .filter((e) => !e.ended_at)
      .sort((a, b) => a.user_name.localeCompare(b.user_name, "pt-BR"))
    const actions = allActions.filter((a) => periodMatches(a.data, filters))
    const interactionActions = actions.filter(
      (a) => a.status === "realizada" && !publicityAction(a),
    )
    const lastInteraction =
      [
        ...contacts.map((c) => ({
          at: c.occurred_at,
          hasTime: true,
          author: c.consultant_name,
          channel: c.channel,
        })),
        ...interactionActions.map((a) => ({
          at: actionStartsAt(a),
          hasTime: Boolean(a.inicio),
          author:
            data.owners.find((o) => o.id === a.createdBy)?.nome ??
            "Autor a identificar",
          channel: a.tipo,
        })),
      ].sort((a, b) => b.at.localeCompare(a.at))[0] ?? null
    const scheduled = actions
      .filter((a) => validScheduledAction(a, now))
      .sort((a, b) => actionStartsAt(a).localeCompare(actionStartsAt(b)))
    const performed = actions
      .filter((a) => publicityAction(a) && a.status === "realizada")
      .sort((a, b) => actionStartsAt(b).localeCompare(actionStartsAt(a)))
    const attendances = new Map<string, CaptureAttendance>()
    const unidentifiedPerformed: AcaoEscola[] = []
    for (const action of performed) {
      const participants = actionAttendees(action, data.owners)
      if (!participants.length) unidentifiedPerformed.push(action)
      for (const person of participants) {
        const attendance = attendances.get(person.id) ?? {
          ...person,
          actionIds: [],
        }
        if (!attendance.actionIds.includes(action.id))
          attendance.actionIds.push(action.id)
        attendances.set(person.id, attendance)
      }
    }
    const pendingResults = performed.filter((a) => !actionHasResults(a))
    const latestByUser = new Map<string, CampaignContact>()
    for (const contact of contacts)
      if (!latestByUser.has(contact.consultant_id))
        latestByUser.set(contact.consultant_id, contact)
    const openUsers = new Set(engagements.map((e) => e.user_id))
    const nextSteps = [...latestByUser.values()]
      .filter((c) => c.next_step && openUsers.has(c.consultant_id))
      .sort((a, b) =>
        (a.return_at || "9999").localeCompare(b.return_at || "9999"),
      )
    const alerts: string[] = []
    if (!lastInteraction) alerts.push("Sem contato no ciclo")
    if (elig === "unknown") alerts.push("Confirmar séries")
    if (nextSteps.some((c) => c.return_at && c.return_at < now))
      alerts.push("Retorno vencido")
    if (
      engagements.some(
        (e) =>
          ["em_contato", "em_negociacao", "aguardando_retorno"].includes(
            e.status,
          ) && !latestByUser.get(e.user_id)?.next_step,
      )
    )
      alerts.push("Atuação sem próximo passo")
    const soon = new Date(
      new Date(now).getTime() + 48 * 60 * 60 * 1000,
    ).toISOString()
    if (
      scheduled.some(
        (a) => a.status !== "confirmada" && actionStartsAt(a) <= soon,
      )
    )
      alerts.push("Ação próxima aguardando confirmação")
    if (
      actions.some(
        (a) =>
          ["agendada", "confirmada", "reagendada"].includes(a.status) &&
          actionStartsAt(a) < now,
      )
    )
      alerts.push("Ação vencida: confirmar realização ou reagendar")
    if (
      actions.some((a) => publicityAction(a) && a.status === "cancelada") &&
      !scheduled.length &&
      !performed.length
    )
      alerts.push("Ação cancelada: reagendar")
    if (pendingResults.length)
      alerts.push("Ação realizada com resultado pendente")
    const ready =
      Boolean(lastInteraction) &&
      (contacts[0]?.negotiation_status === "agendamento_conjunto" ||
        engagements.some((e) => e.status === "agendamento_conjunto"))
    const status: CaptureStatus = performed.length
      ? "performed"
      : scheduled.length
        ? "scheduled"
        : !lastInteraction
          ? "no_contact"
          : ready
            ? "ready_to_schedule"
            : "negotiating"
    const resultRows = performed
      .filter(actionHasResults)
      .flatMap((a) => a.resultados)
    const impacts = resultRows.filter((r) => r.impactados != null)
    const hasMovementInPeriod =
      contacts.length > 0 ||
      actions.length > 0 ||
      allEngagements.some((e) => periodMatches(dayOf(e.updated_at), filters))
    return [
      {
        school,
        status,
        eligibility: elig,
        contacts,
        engagements,
        actions,
        lastContact: contacts[0] ?? null,
        lastInteraction,
        nextSteps,
        nextAction: scheduled[0] ?? null,
        scheduled,
        performed,
        pendingResults,
        alerts,
        metrics: {
          all: true,
          eligible: elig === "eligible",
          no_contact: status === "no_contact",
          no_engagement: !engagements.length,
          negotiating: status === "negotiating",
          ready_to_schedule: status === "ready_to_schedule",
          to_schedule: !performed.length && !scheduled.length,
          scheduled: status === "scheduled",
          performed: performed.length > 0,
          pending_results: pendingResults.length > 0,
        },
        leads: resultRows.reduce((s, r) => s + r.leads, 0),
        pendingRegistrations: resultRows.reduce(
          (s, r) => s + (r.inscricoesPendentes || 0),
          0,
        ),
        registrations: resultRows.reduce(
          (s, r) => s + r.inscricoesSupervest,
          0,
        ),
        impacted: impacts.length
          ? impacts.reduce((s, r) => s + (r.impactados || 0), 0)
          : null,
        attendances: [...attendances.values()].sort((a, b) =>
          a.name.localeCompare(b.name, "pt-BR"),
        ),
        unidentifiedPerformed,
        hasMovementInPeriod,
      },
    ]
  })
}
export function filterCaptureSummaries(
  rows: SchoolCaptureSummary[],
  filters: CaptureFilters,
  applySituation = true,
) {
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
  return rows.filter(
    (r) =>
      normalize(r.school.nome).includes(normalize(filters.name)) &&
      (!filters.city || r.school.cidade === filters.city) &&
      (!filters.network || r.school.rede === filters.network) &&
      (!filters.classification ||
        r.school.classificacao === filters.classification) &&
      (!filters.stage || r.school.etapa === filters.stage) &&
      (!filters.actingConsultant ||
        r.engagements.some((e) => e.user_id === filters.actingConsultant)) &&
      (!filters.attendingConsultant ||
        (filters.attendingConsultant === UNIDENTIFIED_CONSULTANT
          ? r.unidentifiedPerformed.length > 0
          : r.attendances.some((a) => a.id === filters.attendingConsultant))) &&
      (filters.status === "all" || r.status === filters.status) &&
      (!(filters.from || filters.to) || r.hasMovementInPeriod) &&
      (!applySituation || r.metrics[filters.situation]),
  )
}
export function captureTotals(rows: SchoolCaptureSummary[]) {
  rows = [...new Map(rows.map((r) => [r.school.id, r])).values()]
  return {
    actions: rows.reduce((s, r) => s + r.actions.length, 0),
    scheduled: rows.reduce((s, r) => s + r.scheduled.length, 0),
    performed: rows.reduce((s, r) => s + r.performed.length, 0),
    pendingResults: rows.reduce((s, r) => s + r.pendingResults.length, 0),
    leads: rows.reduce((s, r) => s + r.leads, 0),
    pending: rows.reduce((s, r) => s + r.pendingRegistrations, 0),
    registrations: rows.reduce((s, r) => s + r.registrations, 0),
  }
}

export type CaptureCommand =
  | "start"
  | "contact"
  | "close"
  | "associate"
  | "action"
  | "result"
export const isUuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
export function validateCapturePayload(
  command: CaptureCommand,
  payload: Record<string, unknown>,
  grades: GradeLevel[],
) {
  const p = { ...payload }
  const text = (key: string, required = false, max = 5000) => {
    const v = typeof p[key] === "string" ? String(p[key]).trim() : ""
    if ((required && !v) || v.length > max)
      throw new Error(`Preencha corretamente o campo ${key}.`)
    p[key] = v || null
    return v
  }
  const uuid = (key: string, required = false) => {
    if (p[key] && !isUuid(p[key])) throw new Error("Identificador inválido.")
    if (required && !p[key]) throw new Error("Selecione o registro ou usuário.")
  }
  const integer = (value: unknown, required = false) => {
    if (value == null || value === "") {
      if (required)
        throw new Error("Informe as quantidades, inclusive quando forem zero.")
      return null
    }
    const n = Number(value)
    if (!Number.isSafeInteger(n) || n < 0 || n > 10000000)
      throw new Error("As quantidades devem ser inteiras e não negativas.")
    return n
  }
  uuid("id", ["close", "associate", "contact", "result"].includes(command))
  if (command === "start" || command === "contact" || command === "action") {
    if (
      !Array.isArray(p.support_ids) ||
      p.support_ids.some((id) => !isUuid(id))
    )
      throw new Error("Selecione participantes válidos.")
    p.support_ids = [...new Set(p.support_ids)]
  }
  if (command === "start" || command === "contact") {
    if (
      ![
        "em_contato",
        "em_negociacao",
        "aguardando_retorno",
        "agendamento_conjunto",
      ].includes(String(p.status))
    )
      throw new Error("Situação inválida.")
  }
  if (command === "contact") {
    uuid("contact_id")
    text("person_name", true, 200)
    text("person_role", false, 200)
    text("description", true)
    text("response")
    text("next_step")
    if (
      !["Ligação", "WhatsApp", "E-mail", "Visita", "Outro"].includes(
        String(p.channel),
      )
    )
      throw new Error("Canal inválido.")
    if (!p.occurred_at || !Number.isFinite(Date.parse(String(p.occurred_at))))
      throw new Error("Informe a data e o horário do contato.")
    if (
      p.return_at &&
      (!p.next_step || !Number.isFinite(Date.parse(String(p.return_at))))
    )
      throw new Error("Informe o próximo passo e uma data de retorno válida.")
  }
  if (command === "action") {
    uuid("primary_user_id", true)
    uuid("contact_id")
    text("objective", true)
    text("location", true, 500)
    text("notes")
    text("class_details", false, 1000)
    if (
      !(TIPOS_ACAO_HS as readonly string[]).includes(String(p.action_type)) ||
      !(STATUS_ACAO_HS as readonly string[]).includes(String(p.status))
    )
      throw new Error("Tipo ou situação da ação inválida.")
    actionTimestamp(String(p.action_date), String(p.start_time))
    actionTimestamp(String(p.action_date), String(p.end_time))
    if (String(p.end_time) <= String(p.start_time))
      throw new Error("O horário final deve ser posterior ao inicial.")
    if (
      !Array.isArray(p.target_grades) ||
      !p.target_grades.length ||
      p.target_grades.some((g) => !grades.some((grade) => grade.code === g))
    )
      throw new Error("Selecione as séries envolvidas.")
    p.target_grades = [...new Set(p.target_grades)]
    p.estimated_students = integer(p.estimated_students)
    p.estimated_classes = integer(p.estimated_classes)
  }
  if (command === "result") {
    text("notes")
    if (!Array.isArray(p.results) || !p.results.length)
      throw new Error(
        "Informe pelo menos uma série, inclusive para resultado zero.",
      )
    const seen = new Set<string>()
    p.results = p.results.map((raw) => {
      if (!raw || typeof raw !== "object")
        throw new Error("Resultado inválido.")
      const r = raw as Record<string, unknown>
      const grade = grades.find((g) => g.code === r.grade)
      if (!grade || seen.has(grade.code))
        throw new Error("Série inválida ou repetida.")
      seen.add(grade.code)
      return {
        grade: grade.code,
        classes: integer(r.classes),
        impacted: integer(r.impacted),
        leads: integer(r.leads, true),
        pending: grade.supervestEligible ? integer(r.pending, true) : 0,
        registrations: grade.supervestEligible
          ? integer(r.registrations, true)
          : 0,
      }
    })
  }
  if (command === "associate") p.publicity = Boolean(p.publicity)
  return p
}
