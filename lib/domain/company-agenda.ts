import { padTime } from "./attendance"
export function companyAgendaItem(row: any, meeting: boolean) {
  const local = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso))
  const start = meeting ? local(row.start_at) : null, end = meeting ? local(row.end_at) : null
  return {
    id: row.id, sourceType: meeting ? "company_meeting" : "company_activity",
    userId: meeting ? row.organizer_user_id : row.next_action_owner_id,
    responsibleName: row.responsible_name || "Responsável do CRM",
    activity: meeting || row.next_action_kind === "external" ? "external" : "internal",
    title: meeting ? row.title : row.proxima_acao,
    companyId: meeting ? row.company_id : row.id,
    companyName: meeting ? row.company?.nome_fantasia || row.company?.razao_social : row.nome_fantasia || row.razao_social,
    date: meeting ? start!.slice(0, 10) : row.data_proxima_acao,
    startTime: meeting ? start!.slice(11, 16) : row.next_action_start_time ? padTime(row.next_action_start_time) : "",
    endTime: meeting ? end!.slice(11, 16) : row.next_action_end_time ? padTime(row.next_action_end_time) : "",
    location: meeting ? row.location || row.meeting_url : row.next_action_location,
    notes: meeting ? row.description : null,
    status: meeting && row.status === "cancelada" ? "cancelled" : "published",
    inviteError: meeting ? row.sync_error : null,
    companyStatus: meeting ? row.status : "Próximo passo",
  }
}

/** Completed company actions have a known start, without an invented duration. */
export function companyActionAgendaItem(row: any) {
  return { ...companyAgendaItem({ ...row, organizer_user_id: row.responsible_user_id,
    start_at: row.occurred_at, end_at: row.occurred_at, status: "realizada" }, true),
    sourceType: "company_action_history", endTime: "", companyStatus: "Realizada", inviteError: null }
}
