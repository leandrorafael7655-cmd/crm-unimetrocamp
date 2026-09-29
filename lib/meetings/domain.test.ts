import { describe, it, expect } from "vitest"
import { graphPayload, meetingBody, normalizeParticipants, validateMeetingInput } from "./domain"
import type { MeetingInput, MeetingPayload } from "./types"

const id = "12345678-1234-1234-1234-123456789012"
const input: MeetingInput = {
  id,
  companyId: id,
  contactId: id,
  revision: 0,
  date: "2027-02-20",
  startTime: "14:00",
  endTime: "15:00",
  title: "Parceria",
  description: "Pauta",
  meetingType: "teams",
  location: "",
  participants: [],
}
const payload: MeetingPayload = {
  company_id: id,
  company_name: "Empresa <X>",
  contact_id: id,
  contact_name: "Contato",
  contact_email: "contato@example.com",
  organizer_user_id: id,
  organizer_name: "Consultor",
  organizer_email: "consultor@example.com",
  date: input.date,
  title: input.title,
  description: "<script>alert(1)</script>\nPauta",
  meeting_type: "teams",
  start_at: "2027-02-20T17:00:00.000Z",
  end_at: "2027-02-20T18:00:00.000Z",
  location: "",
  participants: [{ name: "Maria", email: "maria@example.com" }],
}

describe("B2B meeting contract", () => {
  it("normalizes participants without inviting the organizer or principal twice", () => {
    expect(
      normalizeParticipants(
        [
          { name: "", email: "MARIA@example.com " },
          { name: "x", email: "maria@example.com" },
          { name: "host", email: " CONSULTOR@example.com" },
          { name: "main", email: "CONTATO@example.com" },
        ],
        payload.organizer_email,
        payload.contact_email,
      ),
    ).toEqual([{ name: "", email: "maria@example.com" }])
    expect(() =>
      normalizeParticipants(
        [{ name: "invalid", email: "bad" }],
        payload.organizer_email,
        payload.contact_email,
      ),
    ).toThrow(/e-mail válido/)
  })
  it("validates real dates and end times and uses São Paulo time", () => {
    expect(validateMeetingInput(input)).toEqual({ start_at: payload.start_at, end_at: payload.end_at })
    for (const change of [
      { date: "2027-02-30" },
      { startTime: "24:00" },
      { endTime: "13:00" },
      { endTime: "14:00" },
      { meetingType: "presencial", location: "" },
    ])
      expect(() => validateMeetingInput({ ...input, ...change } as MeetingInput)).toThrow()
  })
  it("uses a stable transaction and the correct required/optional attendee roles", () => {
    const graph = graphPayload(payload, id)
    expect(graph.transactionId).toBe(id)
    expect(graph.attendees.map((p) => p.type)).toEqual(["required", "optional"])
    expect(graph.attendees.some((p) => p.emailAddress.address === payload.organizer_email)).toBe(false)
    expect(graph).toMatchObject({
      isOnlineMeeting: true,
      onlineMeetingProvider: "teamsForBusiness",
      allowNewTimeProposals: true,
      responseRequested: true,
    })
  })
  it("preserves the Teams blob on updates and escapes user-supplied HTML", () => {
    const existing = `<html><body>${meetingBody(payload)}<div>Microsoft Teams JOIN BLOB</div></body></html>`
    const updated = meetingBody({ ...payload, description: "Nova pauta" }, existing)
    expect(updated).toContain("Microsoft Teams JOIN BLOB")
    expect(updated).not.toContain("alert(1)")
    expect(updated.match(/uniconecta-meeting-start/g)).toHaveLength(1)
    expect(meetingBody(payload)).toContain("&lt;script&gt;")
    expect(meetingBody(payload)).not.toContain("<script>")
  })
  it("updates the same event without resetting the immutable online flag", () => {
    const graph = graphPayload({ ...payload, meeting_type: "presencial", location: "Sala 1" }, id, {
      isOnlineMeeting: true,
      body: { content: meetingBody(payload) },
    })
    expect(graph).not.toHaveProperty("transactionId")
    expect(graph).not.toHaveProperty("isOnlineMeeting")
    expect(graph).toMatchObject({ location: { displayName: "Sala 1" } })
    expect(graph.body.content).toContain("Presencial")
  })
})
