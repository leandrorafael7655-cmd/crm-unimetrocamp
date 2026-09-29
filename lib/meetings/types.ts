export interface Participant {
  name: string
  email: string
}
export type CalendarProvider = "email" | "graph"
export interface CompanyContact {
  id: string
  company_id: string
  nome: string
  cargo: string | null
  email: string | null
  telefone: string | null
  observacoes: string | null
  is_primary: boolean
}
export const MEETING_STATUSES = {
  agendada: "Agendada",
  confirmada: "Confirmada",
  reagendamento_solicitado: "Reagendamento solicitado",
  realizada: "Realizada",
  cancelada: "Cancelada",
  nao_compareceu: "Não compareceu",
} as const
export type MeetingStatus = keyof typeof MEETING_STATUSES
export interface MeetingInput {
  id: string
  companyId: string
  contactId: string
  revision: number
  date: string
  startTime: string
  endTime: string
  title: string
  description: string
  meetingType: "presencial" | "teams" | "online"
  calendarProvider?: CalendarProvider
  meetingUrl?: string
  location: string
  participants: Participant[]
}
export interface MeetingPayload {
  company_id: string
  company_name: string
  contact_id: string
  contact_name: string
  contact_email: string
  organizer_user_id: string
  organizer_name: string
  organizer_email: string
  date: string
  title: string
  description: string
  meeting_type: "presencial" | "teams" | "online"
  calendar_provider?: CalendarProvider
  meeting_url?: string
  start_at: string
  end_at: string
  location: string
  participants: Participant[]
}
export interface MeetingRow {
  id: string
  company_id: string
  contact_id: string
  contato: string
  contact_email: string
  organizer_user_id: string
  organizer_name: string
  organizer_email: string
  title: string
  description: string
  meeting_type: "presencial" | "teams" | "online"
  calendar_provider: CalendarProvider
  calendar_uid: string
  calendar_organizer_email: string | null
  email_queued_revision: number
  meeting_url: string | null
  location: string
  start_at: string
  end_at: string
  status: MeetingStatus
  created_at: string
  updated_at: string
  outlook_event_id: string | null
  outlook_web_url: string | null
  teams_meeting_url: string | null
  outlook_change_key: string | null
  revision: number
  sync_status: "pending" | "syncing" | "synced" | "failed"
  sync_error: string | null
  sync_operation: "create" | "update" | "cancel" | null
  sync_payload: MeetingPayload | null
  sync_lock: string | null
  sync_locked_at: string | null
  meeting_rsvp: { email: string; response: string }[]
  activity_participants: Participant[]
}
export interface MicrosoftConnection {
  configured: boolean
  connected: boolean
  email: string | null
  missing: string[]
}
