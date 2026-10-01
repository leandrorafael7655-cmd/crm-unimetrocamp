import type { Atividade } from "@/lib/domain/types"

export type CompanyActionType = "presencial" | "online"
export type HistoryFilter = "all" | CompanyActionType
export interface CompanyActionInput {
  id: string
  companyId: string
  actionType: CompanyActionType
  title: string
  date: string
  time: string
  responsibleUserId: string
  description: string
  result: string
  notes: string
  location: string
  channel: string
  promotionUrl: string
}
export interface CompanyActionRow {
  id: string
  company_id: string
  action_type: CompanyActionType
  title: string
  occurred_at: string
  responsible_user_id: string | null
  responsible_name: string
  description: string
  result: string | null
  notes: string | null
  location: string | null
  channel: string | null
  promotion_url: string | null
  created_by: string | null
  creator_name: string
  created_at: string
}
export const ACTION_TIME_ZONE = "America/Sao_Paulo"
const localFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: ACTION_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
})
export function localActionDateTime(iso = new Date().toISOString()) {
  const p = Object.fromEntries(localFormatter.formatToParts(new Date(iso)).map(p => [p.type, p.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}
export function actionTimestamp(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error("Informe uma data e um horário válidos.")
  const target = `${date}T${time}:00Z`
  const wanted = Date.parse(target)
  if (!Number.isFinite(wanted) || new Date(wanted).toISOString().slice(0, 10) !== date)
    throw new Error("Informe uma data válida.")
  let candidate = wanted
  // Resolve the São Paulo offset for the action's date, including historical DST.
  for (let i = 0; i < 3; i++) {
    const local = localActionDateTime(new Date(candidate).toISOString())
    const rendered = Date.parse(`${local.date}T${local.time}:00Z`)
    candidate += wanted - rendered
  }
  const local = localActionDateTime(new Date(candidate).toISOString())
  if (local.date !== date || local.time !== time)
    throw new Error("Este horário não existe na data selecionada. Escolha outro horário.")
  return new Date(candidate).toISOString()
}
export function httpLink(value?: string | null) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined
  } catch { return undefined }
}
export function validateCompanyAction(input: CompanyActionInput) {
  if (input.actionType !== "presencial" && input.actionType !== "online")
    throw new Error("Selecione o tipo de ação.")
  const text = (value: unknown, label: string, limit: number, required = false) => {
    const normalized = typeof value === "string" ? value.trim() : ""
    if (required && !normalized) throw new Error(`Informe ${label}.`)
    if (normalized.length > limit) throw new Error(`${label} deve ter até ${limit} caracteres.`)
    return normalized
  }
  const title = text(input.title, "o título", 160, true)
  const description = text(input.description, "a descrição", 5000, true)
  const result = text(input.result, "o resultado", 2000)
  const notes = text(input.notes, "as observações", 5000)
  const location = input.actionType === "presencial" ? text(input.location, "o local da ação", 500, true) : ""
  const channel = input.actionType === "online" ? text(input.channel, "o canal utilizado", 100, true) : ""
  const promotionUrl = input.actionType === "online" ? text(input.promotionUrl, "o link da divulgação", 2048) : ""
  if (promotionUrl && !httpLink(promotionUrl)) throw new Error("Informe um link válido iniciado por http:// ou https://.")
  return {
    action_type: input.actionType, title, description,
    occurred_at: actionTimestamp(input.date, input.time),
    result: result || null, notes: notes || null,
    location: location || null, channel: channel || null, promotion_url: promotionUrl || null,
  }
}
export type HistoryEntry =
  | { kind: "action"; id: string; occurredAt: string; action: CompanyActionRow }
  | { kind: "legacy"; id: string; occurredAt: string; activity: Atividade }
export function companyHistory(actions: CompanyActionRow[], legacy: Atividade[], filter: HistoryFilter = "all"): HistoryEntry[] {
  const entries: HistoryEntry[] = actions.filter(a => filter === "all" || a.action_type === filter)
    .map(action => ({ kind: "action", id: action.id, occurredAt: action.occurred_at, action }))
  if (filter === "all") entries.push(...legacy.map(activity => ({
    kind: "legacy" as const, id: activity.id,
    // Legacy contacts have only a date; keep that date without inventing a time.
    occurredAt: `${activity.data}T00:00:00-03:00`, activity,
  })))
  return entries.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)
    || (b.kind === "action" ? Date.parse(b.action.created_at) : 0) - (a.kind === "action" ? Date.parse(a.action.created_at) : 0)
    || b.id.localeCompare(a.id))
}
