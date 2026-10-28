import { expect, it } from "vitest"
import nodemailer from "nodemailer"
import { meetingEmail } from "@/supabase/functions/send-calendar-invites/email-meetings"
it("serializes a real MIME calendar attachment with REQUEST and CANCEL without making a network connection", async () => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "windows" })
  for (const operation of ["REQUEST", "CANCEL"]) {
    const email = meetingEmail({ id: "fake-message", operation, event_sequence: operation === "REQUEST" ? 1 : 2, created_at: "2026-10-28T12:00:00Z", payload: {
      event_uid: "fake-event@uniconecta", title: "Teste fictício", organizer: "agenda@example.invalid", start_at: "2026-10-29T12:00:00Z", end_at: "2026-10-29T13:00:00Z", recipient: { email: "test@example.invalid" }, attendees: [{ email: "test@example.invalid" }],
    } }, { from: "agenda@example.invalid", organizer: "agenda@example.invalid" })
    const result = await transport.sendMail(email)
    const raw = result.message.toString()
    expect(raw).toMatch(new RegExp(`text/calendar;[^\\r\\n]*method=${operation}`, "i"))
    expect(raw).toContain("uniconecta.ics")
    expect(result.envelope.to).toEqual(["test@example.invalid"])
  }
})
