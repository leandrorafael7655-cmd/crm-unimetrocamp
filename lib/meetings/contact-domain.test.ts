import { describe, expect, it } from "vitest"
import { deliveryLabel, selectedContacts, validateContactMeeting, type ContactMeetingInput } from "./contact-domain"
import { meetingEmail } from "@/supabase/functions/send-calendar-invites/email-meetings"

const input: ContactMeetingInput = { id: "10000000-0000-4000-8000-000000000001", entity: "company",
  entityId: "20000000-0000-4000-8000-000000000001", revision: 0, title: "Parceria", description: "Pauta",
  date: "2098-11-03", startTime: "10:00", endTime: "10:15", mode: "online",
  meetingUrl: "https://teams.microsoft.com/l/meetup-join/test?context=a&b=c", location: "", contactIds: [] }

describe("Contact meeting input and Outlook messages", () => {
  it("allows no contact, requires HTTPS online, validates optional presencial link too", () => {
    expect(validateContactMeeting(input).start_at).toBe("2098-11-03T13:00:00.000Z")
    expect(validateContactMeeting({ ...input, mode: "presencial", location: "Sala 1", meetingUrl: "" }).meeting_url).toBeNull()
    for (const url of ["", "http://teams.microsoft.com/test", "javascript:alert(1)", "https://user:password@example.invalid/x"]) {
      expect(() => validateContactMeeting({ ...input, meetingUrl: url })).toThrow(/HTTPS/)
    }
    expect(() => validateContactMeeting({ ...input, mode: "presencial", location: "Sala", meetingUrl: "http://bad.invalid" })).toThrow(/HTTPS/)
    expect(() => validateContactMeeting({ ...input, title: "UniConecta | Parceria | Empresa" })).toThrow(/assunto/)
  })
  it("accepts IDs only from the ficha and never silently drops a selected missing email", () => {
    const contacts = [{ id: "a", name: "Contato A", email: "  TEST@example.invalid " }, { id: "b", name: "Sem e-mail", email: null }]
    expect(selectedContacts(contacts, ["a", "a"])).toEqual([{ id: "a", name: "Contato A", email: "test@example.invalid" }])
    expect(() => selectedContacts(contacts, ["b"])).toThrow(/desta ficha/)
    expect(() => selectedContacts(contacts, ["foreign"])).toThrow(/desta ficha/)
  })
  it.each(["REQUEST", "CANCEL"])("%s preserves identity/sequence and includes a clickable, escaped Teams link in HTML and ICS URL/location/description", operation => {
    const recipient = { name: "Rafael", email: "test@example.invalid" }
    const job = { id: "job", operation, event_sequence: 2, created_at: "2026-10-29T12:00:00Z", payload: {
      event_uid: "abc-123@uniconecta", organizer: "agenda@example.invalid", title: "UniConecta | Parceria | Escola",
      recipient, attendees: [recipient], start_at: "2098-11-03T13:00:00Z", end_at: "2098-11-03T13:15:00Z",
      meeting_url: input.meetingUrl, location: input.meetingUrl, description: "<script>\n" + input.meetingUrl } }
    const mail = meetingEmail(job, { from: "agenda@example.invalid", organizer: "agenda@example.invalid" })
    const ics = mail.icalEvent.content.replace(/\r\n[ \t]/g, "")
    expect(mail.html).toContain('href="https://teams.microsoft.com/l/meetup-join/test?context=a&amp;b=c"')
    expect(mail.html).not.toContain("<script>")
    for (const value of [`METHOD:${operation}`, "UID:abc-123@uniconecta", "SEQUENCE:2", `URL:${input.meetingUrl}`, `LOCATION:${input.meetingUrl}`, "DTSTART;TZID=America/Sao_Paulo:20981103T100000"]) expect(ics).toContain(value)
    expect(ics).toContain(input.meetingUrl)
    expect(mail.to.address).toBe(recipient.email)
  })
  it("reports delivery without fabricating an RSVP", () => {
    expect(deliveryLabel({ status: "sent_provider", operation: "REQUEST" })).toBe("Enviado · aguardando resposta")
    expect(deliveryLabel({ status: "sent_provider", operation: "CANCEL" })).toBe("Cancelamento enviado")
    expect(deliveryLabel()).toBe("Envio pendente")
  })
})
