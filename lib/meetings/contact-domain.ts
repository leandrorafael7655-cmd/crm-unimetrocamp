import { assertUuid, normalizeEmail, validEmail, validateMeetingInput } from "./domain"

export type ContactMeetingEntity = "company" | "school"
export type ContactMeetingInput = {
  id: string; entity: ContactMeetingEntity; entityId: string; revision: number
  title: string; description: string; date: string; startTime: string; endTime: string
  mode: "online" | "presencial"; meetingUrl: string; location: string; contactIds: string[]
}
export type MeetingContact = { id: string; name: string; email: string | null }
export type ContactDelivery = {
  id: string; meeting_id: string; recipient_email: string; operation: "REQUEST" | "CANCEL"
  event_sequence: number; status: "pending" | "processing" | "sent_provider" | "failed" | "superseded" | "delivery_unknown"
  last_error: string | null; sent_at: string | null
}
export type ContactRecipient = {
  id: string; kind: "consultant" | "contact"; contact_id: string | null; name: string; email: string
}
export type ContactMeeting = {
  id: string; company_id: string | null; school_id: string | null; entity_name: string
  responsible_user_id: string; subject: string; description: string; mode: "online" | "presencial"
  meeting_url: string | null; location: string; start_at: string; end_at: string
  status: "agendada" | "cancelada"; revision: number; event_uid: string; delivery_enabled: boolean
  contact_meeting_recipients: ContactRecipient[]; contact_meeting_jobs: ContactDelivery[]
}

export function validateContactMeeting(input: ContactMeetingInput) {
  if (!["company", "school"].includes(input.entity)) throw new Error("Ficha inválida.")
  if (!Array.isArray(input.contactIds) || input.contactIds.length > 100)
    throw new Error("Selecione até 100 contatos da ficha.")
  input.contactIds.forEach(assertUuid)
  const url = String(input.meetingUrl || "").trim()
  if (url) {
    try {
      const link = new URL(url)
      if (link.protocol !== "https:" || link.username || link.password || url.length > 2000 || /[\r\n]/.test(url)) throw new Error()
    } catch { throw new Error("Informe um link HTTPS válido para a reunião.") }
  }
  const times = validateMeetingInput({ ...input, companyId: input.entityId, contactId: "", meetingType: input.mode,
    calendarProvider: "email", participants: [], meetingUrl: url })
  if (/^UniConecta\s*\|/i.test(input.title.trim()))
    throw new Error("Informe só o assunto, sem o prefixo UniConecta ou o nome da ficha.")
  return { ...times, meeting_url: url || null }
}

export function selectedContacts(contacts: MeetingContact[], ids: string[]) {
  return [...new Set(ids)].map(id => {
    const contact = contacts.find(c => c.id === id)
    if (!contact || !validEmail(normalizeEmail(contact.email || "")))
      throw new Error("Selecione somente contatos desta ficha com e-mail válido.")
    return { ...contact, email: normalizeEmail(contact.email!) }
  })
}

export function deliveryLabel(job?: Pick<ContactDelivery, "status" | "operation">) {
  if (!job) return "Envio pendente"
  if (job.status === "sent_provider") return job.operation === "CANCEL" ? "Cancelamento enviado" : "Enviado · aguardando resposta"
  if (job.status === "superseded") return "Substituído · não enviar"
  if (job.status === "processing") return "Em processamento"
  if (job.status === "delivery_unknown") return "Entrega incerta · conferir antes de reenviar"
  if (job.status === "failed") return "Falha no envio"
  return job.operation === "CANCEL" ? "Cancelamento pendente" : "Envio pendente"
}

export function latestDelivery(jobs: ContactDelivery[], email: string) {
  return jobs.filter(j => j.recipient_email === email).sort((a, b) => b.event_sequence - a.event_sequence)[0]
}
