import "server-only"
import nodemailer from "nodemailer"
import { createAdminClient } from "@/lib/supabase/admin"
import { calendarEmailStatus, smtpConfig, safeSmtpError } from "@/lib/calendar/smtp-config"
import { meetingEmail } from "@/supabase/functions/send-calendar-invites/email-meetings"

type Options = { meetingId?: string; userId?: string; limit?: number }
type ClaimedJob = { id: string; meeting_id: string; recipient_email: string; lease_token: string;
  operation: "REQUEST" | "CANCEL"; event_sequence: number; created_at: string; attempts: number;
  payload: { recipient: { email: string }; [key: string]: unknown } }

/** New outbox only. Never reads or consumes calendar_invite_jobs or the old test sources. */
export async function processContactMeetingQueue(options: Options = {}) {
  const status = calendarEmailStatus(), cfg = smtpConfig()
  const result = { sent: 0, failed: 0, error: "" }
  if (status.disabled || !status.configured) return result
  if (cfg.testUserId && options.userId && cfg.testUserId !== options.userId) return result
  const admin = createAdminClient()
  let testEmail: string | null = null
  if (cfg.testUserId) {
    const { data, error } = await admin.from("profiles").select("email,active").eq("id", cfg.testUserId).single()
    if (error || !data?.active || !data.email) return { ...result, error: "Perfil de teste indisponível; nenhum envio." }
    testEmail = data.email.trim().toLowerCase()
  }
  const transport = nodemailer.createTransport({ host: cfg.host, port: cfg.port, secure: cfg.secure,
    requireTLS: true, auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
    disableFileAccess: true, disableUrlAccess: true })
  const started = Date.now()
  const attempted: string[] = []
  try {
    for (let i = 0; i < Math.min(25, Math.max(1, options.limit || 10)) && Date.now() - started < 20000; i++) {
      const { data, error } = await admin.rpc("claim_contact_meeting_job", {
        p_meeting: options.meetingId || null, p_user: cfg.testUserId || options.userId || null,
        p_test_email: testEmail, p_sender: cfg.organizer, p_exclude: [...attempted],
      })
      if (error) return { ...result, error: "Não foi possível reservar o envio. A fila antiga permanece intacta." }
      const job = data?.[0] as ClaimedJob | undefined
      if (!job) break
      attempted.push(job.id)
      let patch: Record<string, unknown>
      try {
        if (job.recipient_email !== job.payload.recipient.email || (testEmail && job.recipient_email !== testEmail))
          throw new Error("Recipient outside acceptance scope")
        const mail = meetingEmail(job, cfg)
        const info = await transport.sendMail(mail)
        if (!info.accepted?.length || info.rejected?.length) throw new Error("Recipient rejected")
        patch = { status: "sent_provider", sent_at: new Date().toISOString(), provider_message_id: info.messageId,
          last_error: null, next_attempt_at: null }
        result.sent++
      } catch (error) {
        patch = { status: "failed", last_error: safeSmtpError(error),
          next_attempt_at: new Date(Date.now() + Math.min(240, 2 ** Math.min(job.attempts, 6) * 5) * 60000).toISOString() }
        result.failed++
      }
      const { data: saved, error: saveError } = await admin.from("contact_meeting_jobs")
        .update({ ...patch, lease_token: null, updated_at: new Date().toISOString() })
        .eq("id", job.id).eq("status", "processing").eq("lease_token", job.lease_token).select("id").maybeSingle()
      if (saveError || !saved) return { ...result, error: "Envio sem confirmação de registro. Confira o histórico antes de repetir." }
      // Exclude every attempted job for this invocation; one failure cannot starve other recipients.
    }
  } finally { transport.close() }
  return result
}
