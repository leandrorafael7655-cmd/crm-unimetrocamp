import type { MeetingInput, MeetingPayload, Participant } from "./types"

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}
export function validEmail(value: string) {
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value) && value.length <= 254
}
export function assertUuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
    throw new Error("Identificador inválido.")
}
export function normalizeParticipants(
  values: Participant[],
  organizer: string,
  contact: string,
): Participant[] {
  if (!Array.isArray(values) || values.length > 100)
    throw new Error("Inclua até 100 participantes adicionais.")
  const seen = new Set([normalizeEmail(organizer), normalizeEmail(contact)])
  return values
    .map((p) => ({
      name: String(p.name ?? "")
        .trim()
        .slice(0, 160),
      email: normalizeEmail(String(p.email ?? "")),
    }))
    .filter((p) => {
      if (!validEmail(p.email)) throw new Error("Informe um e-mail válido para cada participante.")
      if (seen.has(p.email)) return false
      seen.add(p.email)
      return true
    })
}
export function validateMeetingInput(input: MeetingInput) {
  assertUuid(input.id)
  assertUuid(input.companyId)
  assertUuid(input.contactId)
  if (!Number.isInteger(input.revision) || input.revision < 0)
    throw new Error("Versão inválida. Recarregue a ficha.")
  if (!input.title?.trim() || input.title.length > 180)
    throw new Error("Informe um assunto de até 180 caracteres.")
  if (typeof input.description !== "string" || input.description.length > 10000)
    throw new Error("A pauta deve ter até 10.000 caracteres.")
  if (!["presencial", "teams"].includes(input.meetingType)) throw new Error("Selecione a modalidade.")
  if (
    typeof input.location !== "string" ||
    input.location.length > 300 ||
    (input.meetingType === "presencial" && !input.location.trim())
  )
    throw new Error("Informe o local da reunião presencial (até 300 caracteres).")
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.startTime) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.endTime)
  )
    throw new Error("Informe data e horários válidos.")
  const start = new Date(`${input.date}T${input.startTime}:00-03:00`)
  const end = new Date(`${input.date}T${input.endTime}:00-03:00`)
  // Round-trip rejects dates such as 30 February; meetings use the CRM's São Paulo zone.
  if (
    !Number.isFinite(start.getTime()) ||
    new Date(`${input.date}T12:00:00Z`).toISOString().slice(0, 10) !== input.date ||
    end <= start
  )
    throw new Error("O término deve ser posterior ao início, na mesma data.")
  return { start_at: start.toISOString(), end_at: end.toISOString() }
}
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
const startMarker = '<div id="uniconecta-meeting-start"></div>'
const endMarker = '<div id="uniconecta-meeting-end"></div>'
export function meetingBody(p: MeetingPayload, existingBody?: string) {
  const block = `${startMarker}<p><b>Empresa:</b> ${escapeHtml(p.company_name)}<br><b>Responsável:</b> ${escapeHtml(p.contact_name)}<br><b>Consultor:</b> ${escapeHtml(p.organizer_name)}<br><b>Modalidade:</b> ${p.meeting_type === "teams" ? "Online via Microsoft Teams" : "Presencial"}${p.location ? `<br><b>Local:</b> ${escapeHtml(p.location)}` : ""}</p><p><b>Pauta:</b><br>${escapeHtml(p.description).replace(/\n/g, "<br>")}</p>${endMarker}`
  if (!existingBody) return block
  // Preserve Microsoft's meeting blob and any Outlook content outside our own block.
  const start = existingBody.indexOf(startMarker),
    end = existingBody.indexOf(endMarker)
  if (start >= 0 && end >= start)
    return existingBody.slice(0, start) + block + existingBody.slice(end + endMarker.length)
  if (/<body[^>]*>/i.test(existingBody)) return existingBody.replace(/<body[^>]*>/i, (tag) => tag + block)
  return block + existingBody
}
export function graphPayload(
  p: MeetingPayload,
  id: string,
  existing?: { body?: { content?: string }; isOnlineMeeting?: boolean },
) {
  return {
    subject: `UniConecta | ${p.title} | ${p.company_name}`,
    body: { contentType: "HTML", content: meetingBody(p, existing?.body?.content) },
    start: { dateTime: p.start_at.replace(/Z$/, ""), timeZone: "UTC" },
    end: { dateTime: p.end_at.replace(/Z$/, ""), timeZone: "UTC" },
    location: { displayName: p.meeting_type === "teams" ? "Microsoft Teams" : p.location },
    attendees: [
      { emailAddress: { address: p.contact_email, name: p.contact_name }, type: "required" },
      ...p.participants.map((p) => ({
        emailAddress: { address: p.email, name: p.name || p.email },
        type: "optional",
      })),
    ],
    responseRequested: true,
    allowNewTimeProposals: true,
    ...(!existing ? { transactionId: id } : {}),
    ...(p.meeting_type === "teams" && !existing?.isOnlineMeeting
      ? { isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness" }
      : {}),
  }
}
