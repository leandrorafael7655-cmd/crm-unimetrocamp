/** Server configuration only. The returned public status never contains credentials. */
export function smtpConfig(env: Readonly<Record<string, string | undefined>> = process.env) {
  const value = (name: string, legacy?: string) => (env[name] || (legacy && env[legacy]) || "").trim()
  const port = value("SMTP_PORT", "CALENDAR_SMTP_PORT") || "465"
  const from = value("EMAIL_FROM", "CALENDAR_FROM_EMAIL")
  return {
    host: value("SMTP_HOST", "CALENDAR_SMTP_HOST"), port: Number(port),
    user: value("SMTP_USER", "CALENDAR_SMTP_USER"), pass: value("SMTP_PASS", "CALENDAR_SMTP_PASS"),
    from, organizer: value("EMAIL_ORGANIZER", "CALENDAR_ORGANIZER_EMAIL") || from,
    secure: port === "465", disabled: env.UNICONECTA_DISABLE_EXTERNAL_COMMUNICATIONS === "true",
  }
}

export function calendarEmailStatus(env: Readonly<Record<string, string | undefined>> = process.env) {
  const cfg = smtpConfig(env)
  const missing = ([["SMTP_HOST", cfg.host], ["SMTP_USER", cfg.user], ["SMTP_PASS", cfg.pass], ["EMAIL_FROM", cfg.from]] as const)
    .filter(([, value]) => !value).map(([name]) => name)
  const invalid: string[] = []
  const email = /^[^\s@<>:;,"\\]+@[^\s@<>:;,"\\]+\.[^\s@<>:;,"\\]+$/
  if (![465, 587].includes(cfg.port)) invalid.push("SMTP_PORT")
  if (cfg.from && !email.test(cfg.from)) invalid.push("EMAIL_FROM")
  if (cfg.organizer && !email.test(cfg.organizer)) invalid.push("EMAIL_ORGANIZER")
  // Gmail app-password SMTP must use the authenticated mailbox as sender.
  if (cfg.host === "smtp.gmail.com" && cfg.from.toLowerCase() !== cfg.user.toLowerCase()) invalid.push("EMAIL_FROM")
  return { ok: true, configured: !cfg.disabled && !missing.length && !invalid.length,
    missing, invalid, disabled: cfg.disabled, provider: "smtp", deliveryTracking: false,
    organizerEmail: cfg.organizer || null }
}

/** Do not persist provider responses that can contain credentials, addresses or message bodies. */
export function safeSmtpError(error: unknown): string {
  const code = (error as { code?: string })?.code
  if (code === "EAUTH") return "SMTP: autenticação recusada. Confira a senha de app no Vercel."
  if (["ETIMEDOUT", "ECONNECTION", "ECONNREFUSED", "ESOCKET", "EDNS"].includes(code || ""))
    return "SMTP: conexão indisponível. O compromisso foi preservado; nova tentativa pendente."
  return "O servidor SMTP não confirmou o envio. O compromisso foi preservado; confira a configuração e tente novamente."
}
