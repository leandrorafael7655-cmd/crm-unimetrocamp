import { afterEach, beforeEach, expect, it, vi } from "vitest"
const state = vi.hoisted(() => ({ jobs: [] as any[], patches: [] as any[], sends: vi.fn(), close: vi.fn(), rpc: vi.fn(), transport: vi.fn(), profile: { email: "rafa@example.invalid", active: true }, persisted: true }))
vi.mock("server-only", () => ({}))
vi.mock("nodemailer", () => ({ default: { createTransport: state.transport } }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: state.rpc, from: (table: string) => {
  const q: any = { select: () => q, eq: () => q, single: () => Promise.resolve({ data: state.profile, error: null }),
    update: (patch: any) => { state.patches.push(patch); return q },
    maybeSingle: () => Promise.resolve({ data: state.persisted ? { id: "job" } : null, error: null }) }
  if (!["profiles", "contact_meeting_jobs"].includes(table)) throw new Error("Unexpected legacy table access: " + table)
  return q
} }) }))
import { processContactMeetingQueue } from "./contact-worker"
function job(email = "rafa@example.invalid", id = "job-1", operation = "REQUEST", sequence = 0) {
  const recipient = { name: "Fictício", email }
  return { id, meeting_id: "meeting", lease_token: "lease", recipient_email: email, operation,
    event_sequence: sequence, created_at: "2026-10-29T12:00:00Z", attempts: 1,
    payload: { recipient, attendees: [recipient], organizer: "agenda@example.invalid", event_uid: "same-uid@uniconecta",
      title: "UniConecta | Parceria | Fictícia", description: "Teste", start_at: "2098-11-03T13:00:00Z", end_at: "2098-11-03T13:15:00Z", location: "https://teams.microsoft.com/test", meeting_url: "https://teams.microsoft.com/test" } }
}
beforeEach(() => {
  for (const [key, value] of Object.entries({ SMTP_HOST: "smtp.example.invalid", SMTP_PORT: "465", SMTP_USER: "agenda@example.invalid", SMTP_PASS: "FAKE", EMAIL_FROM: "agenda@example.invalid", EMAIL_ORGANIZER: "agenda@example.invalid", CALENDAR_TEST_USER_ID: "", UNICONECTA_DISABLE_EXTERNAL_COMMUNICATIONS: "false" })) vi.stubEnv(key, value)
  state.jobs = [job()]; state.patches = []; state.persisted = true
  state.rpc.mockReset().mockImplementation(async (name: string) => {
    if (name !== "claim_contact_meeting_job") throw new Error("Legacy queue must never be consumed")
    return { error: null, data: state.jobs.length ? [state.jobs.shift()] : [] }
  })
  state.sends.mockReset().mockResolvedValue({ accepted: ["rafa@example.invalid"], rejected: [], messageId: "stable" })
  state.transport.mockReset().mockReturnValue({ sendMail: state.sends, close: state.close })
  state.close.mockReset()
})
afterEach(() => vi.unstubAllEnvs())
it("pause and invalid test user prevent claims and SMTP entirely", async () => {
  vi.stubEnv("UNICONECTA_DISABLE_EXTERNAL_COMMUNICATIONS", "true")
  expect((await processContactMeetingQueue()).sent).toBe(0)
  expect(state.rpc).not.toHaveBeenCalled(); expect(state.transport).not.toHaveBeenCalled()
  vi.stubEnv("UNICONECTA_DISABLE_EXTERNAL_COMMUNICATIONS", "false")
  vi.stubEnv("CALENDAR_TEST_USER_ID", "invalid")
  await processContactMeetingQueue()
  expect(state.rpc).not.toHaveBeenCalled(); expect(state.transport).not.toHaveBeenCalled()
})
it("test mode passes both the exact user and exact email, and refuses a foreign contact even if claimed", async () => {
  const user = "10000000-0000-4000-8000-000000000001"
  vi.stubEnv("CALENDAR_TEST_USER_ID", user)
  state.jobs = [job("foreign@example.invalid")]
  expect(await processContactMeetingQueue({ meetingId: "meeting" })).toMatchObject({ sent: 0, failed: 1 })
  expect(state.rpc).toHaveBeenCalledWith("claim_contact_meeting_job", expect.objectContaining({ p_user: user, p_test_email: "rafa@example.invalid", p_meeting: "meeting" }))
  expect(state.sends).not.toHaveBeenCalled()
  state.rpc.mockClear()
  await processContactMeetingQueue({ userId: "another" })
  expect(state.rpc).not.toHaveBeenCalled()
})
it("sends to a selected external contact outside acceptance mode, with clickable Teams and recipient privacy", async () => {
  state.jobs = [job("selected@example.invalid")]
  expect(await processContactMeetingQueue({ meetingId: "meeting" })).toMatchObject({ sent: 1 })
  const mail = state.sends.mock.calls[0][0]
  expect(mail.to.address).toBe("selected@example.invalid")
  expect(mail.html).toContain('<a href="https://teams.microsoft.com/test">')
  expect(mail.icalEvent.content).not.toContain("rafa@example.invalid")
  expect(state.patches[0]).toMatchObject({ status: "sent_provider", lease_token: null })
  expect(state.close).toHaveBeenCalledOnce()
})
it("records partial success and a redacted failure without undoing the meeting or retrying successful recipients", async () => {
  state.jobs = [job(), job("second@example.invalid", "job-2")]
  state.sends.mockRejectedValueOnce({ code: "EAUTH", response: "secret-credential" })
  expect(await processContactMeetingQueue()).toMatchObject({ failed: 1, sent: 0 })
  expect(JSON.stringify(state.patches)).not.toContain("secret-credential")
  expect(state.patches[0]).toMatchObject({ status: "failed", lease_token: null })
  expect(await processContactMeetingQueue()).toMatchObject({ sent: 1, failed: 0 })
  expect(state.sends).toHaveBeenCalledTimes(2)
})
it("preserves the UID for reschedule and cancellation, with monotonically increasing sequences", async () => {
  state.jobs = [job(), job(undefined, "job-2", "REQUEST", 1), job(undefined, "job-3", "CANCEL", 2)]
  expect(await processContactMeetingQueue()).toMatchObject({ sent: 3 })
  state.sends.mock.calls.forEach(([mail], i) => {
    expect(mail.icalEvent.content).toContain("UID:same-uid@uniconecta")
    expect(mail.icalEvent.content).toContain("SEQUENCE:" + i)
  })
  expect(state.sends.mock.calls[2][0].icalEvent.method).toBe("CANCEL")
})
it("stops immediately if the SMTP result cannot be persisted under its lease", async () => {
  state.persisted = false; state.jobs = [job(), job(undefined, "job-2")]
  expect((await processContactMeetingQueue()).error).toContain("sem confirmação")
  expect(state.sends).toHaveBeenCalledOnce()
})
