// UI-only fixtures; PostgreSQL invariants and real message rendering have separate tests.
let meetings = []
export function resetContactMeetingFixtures() { meetings = [] }
const email = "rafa@example.test"
export const contactMeetingMocks = {
  loadContactMeetings: async () => ({ ok: true, writable: true, archived: false, paused: true,
    actor: { id: "manager", name: "Rafael Xavier", email }, meetings: structuredClone(meetings),
    contacts: [{ id: "contact-with-email", name: "Contato com e-mail", email }, { id: "contact-without-email", name: "Contato sem e-mail", email: null }] }),
  saveContactMeeting: async input => {
    const current = meetings.find(m => m.id === input.id)
    const recipients = current?.contact_meeting_recipients || [
      { id: "responsible", kind: "consultant", contact_id: null, name: "Rafael Xavier", email },
      ...input.contactIds.map(id => ({ id, kind: "contact", contact_id: id, name: "Contato com e-mail", email })),
    ]
    const revision = input.revision + 1
    const jobs = [...(current?.contact_meeting_jobs || []), { id: crypto.randomUUID(), recipient_email: email, event_sequence: revision - 1, operation: "REQUEST", status: "pending" }]
    const saved = { ...current, id: input.id, subject: input.title, description: input.description, responsible_user_id: "manager",
      start_at: `${input.date}T${input.startTime}:00-03:00`, end_at: `${input.date}T${input.endTime}:00-03:00`, status: "agendada",
      mode: input.mode, meeting_url: input.meetingUrl, location: input.location, revision, event_uid: current?.event_uid || "fixture@uniconecta", delivery_enabled: false,
      contact_meeting_recipients: recipients, contact_meeting_jobs: jobs }
    meetings = [...meetings.filter(m => m.id !== input.id), saved]
    return { ok: true, message: "Reunião salva. Envio pausado." }
  },
  cancelContactMeeting: async (_entity, _entityId, id) => {
    const meeting = meetings.find(m => m.id === id)
    meeting.status = "cancelada"; meeting.revision++
    meeting.contact_meeting_jobs.push({ id: crypto.randomUUID(), recipient_email: email, event_sequence: meeting.revision - 1, operation: "CANCEL", status: "pending" })
    return { ok: true, message: "Reunião cancelada. Envio pausado." }
  },
  retryContactMeeting: async () => ({ ok: true, message: "Envio pausado." }),
}
