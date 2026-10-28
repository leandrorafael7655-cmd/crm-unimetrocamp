import { beforeEach, afterEach, expect, it, vi } from "vitest"
const state = vi.hoisted(() => ({ jobs: [] as any[], updates: [] as any[], meeting: {} as any, event: {} as any,
  person: {} as any, sendMail: vi.fn(), rpc: vi.fn(), createTransport: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("nodemailer", () => ({ default: { createTransport: state.createTransport } }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: state.rpc, from: (table: string) => {
  let single = false, patch: any
  const q: any = { select: () => q, eq: () => q, in: () => q, not: () => q, order: () => q, limit: () => q,
    single: () => { single = true; return q }, update: (value: any) => { patch = value; state.updates.push(value); return q },
    then: (resolve: any) => Promise.resolve({ error: null, data: patch ? [{ id: "j1" }] : table === "activities" ? (single ? state.meeting : []) : table === "calendar_events" ? state.event : state.person }).then(resolve) }
  return q
} }) }))
import { processSmtpQueue } from "./smtp-worker"
beforeEach(() => {
  for (const [key, value] of Object.entries({ SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "465", SMTP_USER: "agenda@example.invalid", SMTP_PASS: "fake-only", EMAIL_FROM: "agenda@example.invalid", UNICONECTA_DISABLE_EXTERNAL_COMMUNICATIONS: "false" })) vi.stubEnv(key, value)
  state.updates = []; state.jobs = [{ id: "j1", calendar_event_id: "e1", operation: "REQUEST", event_sequence: 0, lease_token: "lease", attempts: 1, created_at: "2026-10-28T12:00:00Z" }]
  state.event = { event_uid: "event-1@uniconecta", sequence: 0, status: "active", recipient_user_id: "u1", title: "Teste", start_at: "2026-10-29T12:00:00Z", end_at: "2026-10-29T13:00:00Z" }
  state.person = { email: "test@example.invalid", full_name: "Teste", active: true }
  state.rpc.mockReset().mockImplementation(async (name: string) => ({ error: null, data: name === "claim_calendar_email_jobs" ? state.jobs : null }))
  state.sendMail.mockReset().mockResolvedValue({ accepted: [state.person.email], rejected: [], messageId: "message-1" })
  state.createTransport.mockReset().mockReturnValue({ sendMail: state.sendMail, close: vi.fn() })
})
afterEach(() => vi.unstubAllEnvs())
it("sends REQUEST from the Vercel SMTP transport to the CRM responsible with São Paulo calendar data", async () => {
  expect(await processSmtpQueue({ userId: "u1" })).toMatchObject({ sent: 1, failed: 0 })
  expect(state.createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: "smtp.gmail.com", port: 465, secure: true, requireTLS: true }))
  const message = state.sendMail.mock.calls[0][0]
  expect(message.to.address).toBe("test@example.invalid")
  expect(message.icalEvent.content).toContain("DTSTART;TZID=America/Sao_Paulo:20261029T090000")
  expect(message.icalEvent.content.replace(/\r\n[ \t]/g, "")).toContain("RSVP=TRUE:mailto:test@example.invalid")
  expect(state.rpc).toHaveBeenCalledWith("claim_calendar_email_jobs", expect.objectContaining({ p_user: "u1" }))
})
it("SMTP failure persists a redacted visible error and retains event data", async () => {
  state.sendMail.mockRejectedValueOnce({ code: "EAUTH", response: "fake-only private address" })
  const before = { ...state.event }
  expect(await processSmtpQueue()).toMatchObject({ sent: 0, failed: 1 })
  expect(state.updates.at(-1)).toMatchObject({ status: "failed", lease_token: null })
  expect(JSON.stringify(state.updates)).not.toContain("fake-only")
  expect(state.event).toEqual(before)
})
it("missing SMTP settings are recorded; no transport is contacted", async () => {
  vi.stubEnv("SMTP_PASS", "")
  expect(await processSmtpQueue()).toMatchObject({ configured: false, sent: 0, failed: 1 })
  expect(state.sendMail).not.toHaveBeenCalled()
  expect(state.updates.at(-1).last_error).toContain("configure SMTP_HOST")
})
it("disabled external communications never claim or send jobs", async () => {
  vi.stubEnv("UNICONECTA_DISABLE_EXTERNAL_COMMUNICATIONS", "true")
  expect(await processSmtpQueue()).toMatchObject({ configured: false, sent: 0 })
  expect(state.rpc).not.toHaveBeenCalled(); expect(state.sendMail).not.toHaveBeenCalled()
})
it("a superseded event revision is not sent", async () => {
  state.event.sequence = 1
  expect(await processSmtpQueue()).toMatchObject({ superseded: 1, sent: 0 })
  expect(state.sendMail).not.toHaveBeenCalled()
})
it("a legacy B2B queued recipient outside the responsible profile is not sent", async () => {
  state.jobs[0].meeting_activity_id = "m1"; state.jobs[0].calendar_event_id = null
  state.jobs[0].payload = { recipient: { email: "external@example.invalid" } }
  state.meeting = { revision: 0, organizer_user_id: "u1" }
  expect(await processSmtpQueue()).toMatchObject({ sent: 0, failed: 1 })
  expect(state.sendMail).not.toHaveBeenCalled()
})
it("CANCEL keeps identity and increases the sequence without deleting the appointment", async () => {
  state.jobs[0].operation = "CANCEL"; state.jobs[0].event_sequence = 2
  state.event.status = "cancelled"; state.event.sequence = 2
  expect(await processSmtpQueue()).toMatchObject({ sent: 1 })
  const content = state.sendMail.mock.calls[0][0].icalEvent.content
  expect(content).toContain("UID:event-1@uniconecta"); expect(content).toContain("SEQUENCE:2"); expect(content).toContain("METHOD:CANCEL")
})
