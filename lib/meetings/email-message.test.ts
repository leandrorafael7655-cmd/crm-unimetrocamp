import { describe, expect, it } from "vitest"
import { meetingEmail } from "../../supabase/functions/send-calendar-invites/email-meetings"
const cfg = { from: "agenda@example.com", organizer: "agenda@example.com" }
const people = [
  { name: 'Rafa; "Comercial"', email: "rafa@example.com", role: "REQ-PARTICIPANT" },
  { name: "João", email: "joao@example.com", role: "REQ-PARTICIPANT" },
  { name: "Maria", email: "maria@example.com", role: "OPT-PARTICIPANT" },
]
const job = {
  id: "job-uuid", operation: "REQUEST", event_sequence: 1, created_at: "2026-09-29T12:00:00Z",
  payload: { event_uid: "event-uuid@uniconecta", organizer: cfg.organizer, recipient: people[0], attendees: people,
    title: "Visita à empresa", description: "Pauta com acentuação ".repeat(20), start_at: "2026-10-02T12:00:00Z", end_at: "2026-10-02T13:00:00Z" },
}
describe("calendar invitations without linked accounts", () => {
  it("invites the consultant and external contacts with native calendar RSVP", () => {
    const mail = meetingEmail(job, cfg)
    const ics = mail.icalEvent.content.replace(/\r\n /g, "")
    expect(mail.to.address).toBe("rafa@example.com")
    expect(ics).toContain('ORGANIZER;CN="UniConecta":mailto:agenda@example.com')
    expect(ics.match(/PARTSTAT=NEEDS-ACTION;RSVP=TRUE/g)).toHaveLength(3)
    expect(ics).toContain('CN="Rafa; ^\'Comercial^\'"')
    expect(ics).toContain("ROLE=OPT-PARTICIPANT")
    expect(mail.icalEvent.method).toBe("REQUEST")
    expect(mail.icalEvent.content.split("\r\n").every(line => Buffer.byteLength(line) <= 75)).toBe(true)
  })
  it("retains UID for updates and cancellation and uses a stable message id on retries", () => {
    const original = meetingEmail(job, cfg)
    const update = meetingEmail({ ...job, event_sequence: 2 }, cfg)
    const cancel = meetingEmail({ ...job, operation: "CANCEL", event_sequence: 3 }, cfg)
    for (const mail of [original,update,cancel]) expect(mail.icalEvent.content).toContain("UID:event-uuid@uniconecta")
    expect(cancel.icalEvent.content).toContain("STATUS:CANCELLED")
    expect(update.icalEvent.content).toContain("SEQUENCE:2")
    expect(meetingEmail(job,cfg).messageId).toBe(original.messageId)
  })
  it("rejects changed sender identity and invitation injection", () => {
    expect(()=>meetingEmail(job,{...cfg,organizer:"another@example.com"})).toThrow(/remetente/)
    expect(()=>meetingEmail({...job,payload:{...job.payload,recipient:{email:"evil@example.com\nATTENDEE:x"}}},cfg)).toThrow()
    expect(()=>meetingEmail({...job,payload:{...job.payload,attendees:[...people,{email:cfg.organizer}]}},cfg)).toThrow(/central/)
  })
})
