import { padTime } from "./attendance"

export interface AgendaParticipant {
  userId: string
  name: string
  role: string
}

export interface SchoolAgendaOccurrence {
  id: string
  sourceType: "school_action"
  userId: string | null
  responsibleName: string
  activity: "external"
  date: string
  startTime: string
  endTime: string
  location: string
  notes: string | null
  objective: string | null
  status: "published" | "cancelled"
  schoolStatus: string
  schoolId: string
  schoolName: string
  actionType: string
  schoolCycleId: string | null
  schoolCycleName: string
  participants: AgendaParticipant[]
}

export function saoPauloToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now)
  const value = (type: string) => parts.find((part) => part.type === type)?.value
  return `${value("year")}-${value("month")}-${value("day")}`
}

// O vínculo é com a ação, nunca com o responsável fixo da escola.
export function mapSchoolAgendaOccurrence(row: any, profiles: Map<string, any>): SchoolAgendaOccurrence {
  const school = row.school
  const participants = new Map<string, AgendaParticipant>()
  if (row.primary_owner_id) participants.set(row.primary_owner_id, {
    userId: row.primary_owner_id,
    name: row.primary_owner_name || profiles.get(row.primary_owner_id)?.full_name || "Consultor principal",
    role: "Principal",
  })
  for (const person of row.school_action_participants ?? []) {
    if (!participants.has(person.user_id)) participants.set(person.user_id, {
      userId: person.user_id,
      name: person.user_name || profiles.get(person.user_id)?.full_name || "Consultor participante",
      role: person.role_in_action || "Apoio",
    })
  }
  return {
    id: row.id, sourceType: "school_action", userId: row.primary_owner_id,
    responsibleName: participants.get(row.primary_owner_id)?.name || "Sem consultor principal",
    activity: "external", date: row.action_date,
    startTime: padTime(row.start_time), endTime: padTime(row.end_time),
    location: row.location?.trim() || [school?.logradouro, school?.numero, school?.cidade].filter(Boolean).join(", ") || school?.name || "Local não informado",
    notes: row.notes || null, objective: row.objective || null,
    status: row.status === "cancelada" ? "cancelled" : "published", schoolStatus: row.status,
    schoolId: row.school_id, schoolName: school?.name || "Escola",
    actionType: row.action_type || "Ação em escola",
    schoolCycleId: row.supervest_cycle_id || null,
    schoolCycleName: row.cycle?.name || "Sem edição vinculada",
    participants: [...participants.values()],
  }
}

export function matchesAgendaFilters(occ: any, filters: { userId?: string; activity?: string; status?: string; schoolId?: string; schoolCycleId?: string }) {
  const school = occ.sourceType === "school_action"
  if (filters.userId && (school ? !occ.participants.some((p: AgendaParticipant) => p.userId === filters.userId) : occ.userId !== filters.userId)) return false
  if (filters.activity && (filters.activity === "school" ? !school : occ.activity !== filters.activity)) return false
  if (filters.status && occ.status !== filters.status && (!school || occ.schoolStatus !== filters.status)) return false
  if (filters.schoolId && (!school || occ.schoolId !== filters.schoolId)) return false
  if (filters.schoolCycleId && (!school || occ.schoolCycleId !== filters.schoolCycleId)) return false
  return true
}
