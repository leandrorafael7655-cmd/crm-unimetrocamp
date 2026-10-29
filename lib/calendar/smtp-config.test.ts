import { expect, it } from "vitest"
import { calendarEmailStatus, safeSmtpError, smtpConfig } from "./smtp-config"
const env = { SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "465", SMTP_USER: "sender@example.invalid", SMTP_PASS: "fake-only", EMAIL_FROM: "sender@example.invalid" }
it("uses Vercel SMTP variables and implicit TLS on 465 without Microsoft", () => {
  expect(smtpConfig(env)).toMatchObject({ secure: true, port: 465, pass: "fake-only" })
  expect(calendarEmailStatus(env)).toMatchObject({ configured: true, provider: "smtp" })
  expect(JSON.stringify(calendarEmailStatus(env))).not.toContain("fake-only")
})
it("missing configuration, sender mismatch, invalid port and disabled sending are explicit", () => {
  expect(calendarEmailStatus({})).toMatchObject({ configured: false, missing: ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"] })
  expect(calendarEmailStatus({ ...env, EMAIL_FROM: "other@example.invalid" }).invalid).toContain("EMAIL_FROM")
  expect(calendarEmailStatus({ ...env, SMTP_PORT: "25" }).configured).toBe(false)
  expect(calendarEmailStatus({ ...env, UNICONECTA_DISABLE_EXTERNAL_COMMUNICATIONS: "true" }).configured).toBe(false)
})
it("redacts SMTP responses instead of storing passwords or recipient details", () => {
  expect(safeSmtpError({ code: "EAUTH", response: "fake-only sender@example.invalid" })).not.toContain("fake-only")
  expect(safeSmtpError({ response: "private" })).not.toContain("private")
})
