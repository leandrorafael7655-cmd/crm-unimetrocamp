import "server-only"
import nodemailer from "nodemailer"
import { createAdminClient } from "@/lib/supabase/admin"
import { meetingEmail } from "@/supabase/functions/send-calendar-invites/email-meetings"
import { calendarEmailStatus, safeSmtpError, smtpConfig } from "./smtp-config"

type Options = { limit?: number; userId?: string; meetingId?: string }
type QueueResult = { configured: boolean; processed: number; sent: number; failed: number; superseded: number; error?: string }
export async function processSmtpQueue(options: Options = {}): Promise<QueueResult> {
  const status = calendarEmailStatus()
  const result = { configured: status.configured, processed: 0, sent: 0, failed: 0, superseded: 0 }
  if (status.disabled) return result
  const cfg = smtpConfig()
  // During production acceptance only the verified test profile may receive mail,
  // including cron/manual calls that otherwise process the whole team queue.
  if (status.invalid.includes("CALENDAR_TEST_USER_ID")) return { ...result, error: "Perfil de validação inválido; nenhum convite enviado." }
  if (cfg.testUserId && options.userId && cfg.testUserId !== options.userId) return result
  const scopedUser = cfg.testUserId || options.userId
  const admin = createAdminClient()
  // Meetings saved before SMTP configuration are picked up by the same retry path.
  if (status.configured) {
    let query = admin.from("activities").select("id,revision,email_queued_revision")
      .eq("calendar_provider", "email").in("sync_status", ["pending", "failed"]).not("meeting_type", "is", null).order("updated_at").limit(25)
    if (options.meetingId) query = query.eq("id", options.meetingId)
    if (scopedUser) query = query.eq("organizer_user_id", scopedUser)
    const { data: meetings, error: meetingError } = await query
    if (meetingError) return { ...result, error: "Não foi possível consultar os convites pendentes." }
    for (const meeting of meetings || []) if (meeting.revision > meeting.email_queued_revision) {
      const { error: queueError } = await admin.rpc("b2b_queue_email_meeting", { p_id: meeting.id, p_sender: cfg.organizer })
      if (queueError) return { ...result, error: "Não foi possível preparar os convites pendentes." }
    }
  }
  const { data: jobs, error } = await admin.rpc("claim_calendar_email_jobs", {
    p_limit: Math.max(1, Math.min(25, options.limit ?? 10)),
    p_user: scopedUser || null, p_meeting: options.meetingId || null,
  })
  if (error) return { ...result, error: "Não foi possível processar a fila de convites." }
  if (!jobs?.length) return result
  const transport = status.configured ? nodemailer.createTransport({
    host: cfg.host, port: cfg.port, secure: cfg.secure, requireTLS: true,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
    disableFileAccess: true, disableUrlAccess: true,
  }) : null
  const started = Date.now()
  for (const job of jobs) {
    if (Date.now() - started > 25000) {
      await admin.from("calendar_invite_jobs").update({ status: "pending", lease_token: null }).eq("id", job.id).eq("lease_token", job.lease_token)
      continue
    }
    result.processed++
    let patch: Record<string, unknown>
    try {
      if (!transport) throw new Error("SMTP not configured")
      let email
      if (job.meeting_activity_id) {
        const { data: meeting, error: meetingError } = await admin.from("activities").select("revision,organizer_user_id").eq("id", job.meeting_activity_id).single()
        if (meetingError || !meeting) throw new Error("Meeting unavailable")
        // Do not send any legacy queued message to company contacts or third parties.
        const { data: owner, error: ownerError } = await admin.from("profiles").select("email,active").eq("id", meeting.organizer_user_id).single()
        if (ownerError || !owner?.active || job.payload?.recipient?.email?.toLowerCase() !== owner.email?.toLowerCase())
          throw new Error("Only the responsible CRM user may receive an invitation")
        if (job.event_sequence !== meeting.revision) {
          const { error: staleError } = await admin.from("calendar_invite_jobs").update({ status: "sent_provider", provider: "superseded", lease_token: null, last_error: null })
            .eq("id", job.id).eq("lease_token", job.lease_token)
          if (staleError) return { ...result, error: "Falha ao registrar o estado da fila." }
          result.superseded++; continue
        }
        email = meetingEmail({ ...job, payload: { ...job.payload,
          attendees: [{ name: job.payload.recipient.name, email: owner.email }] } }, cfg)
      } else {
        const { data: event, error: eventError } = await admin.from("calendar_events").select("*").eq("id", job.calendar_event_id).single()
        if (eventError || !event) throw new Error("Event unavailable")
        if (Number(event.sequence) !== Number(job.event_sequence) ||
          (job.operation === "REQUEST" ? event.status !== "active" : event.status !== "cancelled")) {
          patch = { status: "sent_provider", provider: "superseded", lease_token: null, last_error: null, next_attempt_at: null }
          result.superseded++
          const { error: updateError } = await admin.from("calendar_invite_jobs").update(patch).eq("id", job.id).eq("lease_token", job.lease_token)
          if (updateError) return { ...result, error: "Falha ao registrar o estado da fila." }
          continue
        }
        const { data: person, error: personError } = await admin.from("profiles").select("email,full_name,active").eq("id", event.recipient_user_id).single()
        if (personError || !person?.active) throw new Error("Recipient unavailable")
        email = meetingEmail({ ...job, payload: {
          ...event, event_uid: event.event_uid, organizer: cfg.organizer,
          recipient: { name: person.full_name, email: person.email },
          attendees: [{ name: person.full_name, email: person.email }],
        } }, cfg)
      }
      const info = await transport.sendMail(email)
      if (!info.accepted?.length || info.rejected?.length) throw new Error("Recipient not accepted")
      patch = { status: "sent_provider", provider: "smtp", provider_message_id: info.messageId,
        last_error: null, next_attempt_at: null, sent_at: new Date().toISOString() }
      result.sent++
    } catch (error) {
      result.failed++
      patch = { status: "failed", last_error: status.configured ? safeSmtpError(error) : "Envio pendente: configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS e EMAIL_FROM no Vercel.",
        next_attempt_at: new Date(Date.now() + Math.min(240, 2 ** Math.min(job.attempts, 6) * 5) * 60000).toISOString() }
    }
    const { error: updateError } = await admin.from("calendar_invite_jobs").update({ ...patch, lease_token: null, updated_at: new Date().toISOString() })
      .eq("id", job.id).eq("lease_token", job.lease_token)
    if (updateError) return { ...result, error: "O envio não pôde ser registrado. Confira a fila antes de tentar novamente." }
    if (job.meeting_activity_id) {
      const { error: settleError } = await admin.rpc("b2b_settle_email_meeting", { p_id: job.meeting_activity_id })
      if (settleError) return { ...result, error: "Atualize a ficha para conferir o estado dos convites." }
    }
  }
  transport?.close()
  return result
}
