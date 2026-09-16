import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const env = (name: string) => (Deno.env.get(name) || "").trim();

function requiredConfig() {
  // Preserve existing OAuth setups; new installations default to independent SMTP.
  const provider = env("CALENDAR_EMAIL_PROVIDER") || (
    env("CALENDAR_OAUTH_CLIENT_ID") && !env("CALENDAR_SMTP_PASS")
      ? "microsoft365-smtp-oauth2" : "smtp"
  );
  const port = env("CALENDAR_SMTP_PORT") || "587";
  return {
    provider,
    host: env("CALENDAR_SMTP_HOST") || (provider === "microsoft365-smtp-oauth2" ? "smtp.office365.com" : ""),
    port,
    secure: port === "465" || env("CALENDAR_SMTP_SECURE") === "true",
    user: env("CALENDAR_SMTP_USER"),
    pass: env("CALENDAR_SMTP_PASS"),
    from: env("CALENDAR_FROM_EMAIL"),
    organizer: env("CALENDAR_ORGANIZER_EMAIL") || env("CALENDAR_FROM_EMAIL"),
    tenantId: env("CALENDAR_OAUTH_TENANT_ID"),
    clientId: env("CALENDAR_OAUTH_CLIENT_ID"),
    clientSecret: env("CALENDAR_OAUTH_CLIENT_SECRET"),
    crmUrl: (env("CALENDAR_CRM_URL") || "https://unimetrocamp.vercel.app").replace(/\/+$/, ""),
  };
}

function configurationStatus() {
  const cfg = requiredConfig();
  const required = [
    ["CALENDAR_SMTP_HOST", cfg.host],
    ["CALENDAR_SMTP_USER", cfg.user],
    ["CALENDAR_FROM_EMAIL", cfg.from],
  ];
  if (cfg.provider === "microsoft365-smtp-oauth2") {
    required.push(
      ["CALENDAR_OAUTH_TENANT_ID", cfg.tenantId],
      ["CALENDAR_OAUTH_CLIENT_ID", cfg.clientId],
      ["CALENDAR_OAUTH_CLIENT_SECRET", cfg.clientSecret],
    );
  } else if (cfg.provider === "smtp") {
    required.push(["CALENDAR_SMTP_PASS", cfg.pass]);
  }
  const missing = required.filter(([, value]) => !value).map(([name]) => name);
  const invalid: string[] = [];
  if (!["smtp", "microsoft365-smtp-oauth2"].includes(cfg.provider)) invalid.push("CALENDAR_EMAIL_PROVIDER");
  if (!/^\d+$/.test(cfg.port) || Number(cfg.port) < 1 || Number(cfg.port) > 65535) invalid.push("CALENDAR_SMTP_PORT");
  const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (cfg.from && !validEmail(cfg.from)) invalid.push("CALENDAR_FROM_EMAIL");
  if (cfg.organizer && !validEmail(cfg.organizer)) invalid.push("CALENDAR_ORGANIZER_EMAIL");
  return { configured: missing.length === 0 && invalid.length === 0, missing, invalid };
}

async function createMailTransport(cfg: ReturnType<typeof requiredConfig>) {
  const auth = cfg.provider === "microsoft365-smtp-oauth2"
    ? { type: "OAuth2" as const, user: cfg.user, accessToken: await microsoftAccessToken(cfg) }
    : { user: cfg.user, pass: cfg.pass };
  return nodemailer.createTransport({
    host: cfg.host,
    port: Number(cfg.port),
    secure: cfg.secure,
    requireTLS: true,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    auth,
  });
}

async function microsoftAccessToken(cfg: ReturnType<typeof requiredConfig>) {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "client_credentials",
    scope: "https://outlook.office365.com/.default",
  });
  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.access_token) {
    const detail = data?.error_description || data?.error || `HTTP ${response.status}`;
    throw new Error(`Falha ao obter token OAuth do Microsoft 365: ${String(detail).slice(0, 700)}`);
  }
  return String(data.access_token);
}

function operationalName(recipient: any) {
  const tag = String(recipient?.consultant_tag || "").trim();
  if (tag) {
    if (/^[a-z0-9_-]+$/.test(tag)) {
      return tag.split(/[-_]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
    }
    return tag;
  }
  return recipient?.full_name || recipient?.email || "Usuário";
}

function esc(value: string | null | undefined) {
  return (value || "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function localStamp(iso: string, timeZone = "America/Sao_Paulo") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "00";
  return `${get("year")}${get("month")}${get("day")}T${get("hour")}${get("minute")}${get("second")}`;
}

function utcStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function buildIcs(event: any, recipient: any, operation: "REQUEST" | "CANCEL", organizer: string, crmUrl: string) {
  const tz = event.timezone || "America/Sao_Paulo";
  const link = event.crm_path ? `${crmUrl}${event.crm_path}` : crmUrl;
  const recipientName = operationalName(recipient);
  const description = [
    event.description,
    `Responsável: ${recipientName}`,
    `Consultar no UniConecta: ${link}`,
  ].filter(Boolean).join("\n\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//UniConecta//Agenda Comercial//PT-BR",
    "VERSION:2.0",
    `METHOD:${operation}`,
    "CALSCALE:GREGORIAN",
    "BEGIN:VTIMEZONE",
    "TZID:America/Sao_Paulo",
    "X-LIC-LOCATION:America/Sao_Paulo",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:-0300",
    "TZOFFSETTO:-0300",
    "TZNAME:BRT",
    "DTSTART:19700101T000000",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:${event.event_uid}`,
    `DTSTAMP:${utcStamp()}`,
    `SEQUENCE:${Number(event.sequence || 0)}`,
    `DTSTART;TZID=${tz}:${localStamp(event.start_at, tz)}`,
    `DTEND;TZID=${tz}:${localStamp(event.end_at, tz)}`,
    `SUMMARY:${esc(event.title)}`,
    `DESCRIPTION:${esc(description)}`,
    event.location ? `LOCATION:${esc(event.location)}` : null,
    `ORGANIZER;CN=UniConecta:mailto:${organizer}`,
    `ATTENDEE;CN=${esc(recipientName)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${recipient.email}`,
    `URL:${link}`,
    operation === "CANCEL" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.join("\r\n") + "\r\n";
}

async function authorize(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (token && token === SERVICE_KEY) return { system: true, userId: null };

  const client = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Error("Não autenticado.");
  const { data: profile } = await client.from("profiles").select("active").eq("id", user.id).maybeSingle();
  if (!profile?.active) throw new Error("Usuário inativo.");
  return { system: false, userId: user.id };
}

Deno.serve(async (req: Request) => {
  try {
    await authorize(req);
    const body = await req.json().catch(() => ({}));
    const action = body?.action || "process";
    const config = configurationStatus();
    const cfg = requiredConfig();

    if (action === "status") {
      return Response.json({
        ok: true,
        ...config,
        provider: cfg.provider,
        authMode: cfg.provider === "smtp" ? "smtp_credentials" : "client_credentials",
        deliveryTracking: false,
      });
    }
    if (action !== "process") return Response.json({ ok: false, message: "Ação inválida." }, { status: 400 });
    if (!config.configured) {
      return Response.json({
        ok: false,
        configured: false,
        missing: config.missing,
        invalid: config.invalid,
        provider: cfg.provider,
        message: "Serviço de envio de convites pendente de configuração.",
      }, { status: 503 });
    }

    const transport = await createMailTransport(cfg);
    await transport.verify();

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const limit = Math.max(1, Math.min(50, Number(body?.limit || 20)));
    const now = new Date().toISOString();
    const { data: jobs, error: jobsError } = await admin
      .from("calendar_invite_jobs")
      .select("*")
      .in("status", ["pending", "failed"])
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (jobsError) throw jobsError;

    let sent = 0;
    let failed = 0;
    let superseded = 0;
    let claimedCount = 0;
    const results: any[] = [];

    for (const job of jobs || []) {
      const attempts = Number(job.attempts || 0) + 1;
      const { data: claim, error: claimError } = await admin
        .from("calendar_invite_jobs")
        .update({ status: "processing", attempts, updated_at: new Date().toISOString() })
        .eq("id", job.id)
        .in("status", ["pending", "failed"])
        .select("id");
      if (claimError) throw claimError;
      if (!claim?.length) continue;
      claimedCount++;

      try {
        const { data: event, error: eventError } = await admin.from("calendar_events").select("*").eq("id", job.calendar_event_id).single();
        if (eventError || !event) throw new Error(eventError?.message || "Evento não encontrado");

        const operation = job.operation as "REQUEST" | "CANCEL";
        const sequenceMatches = Number(job.event_sequence) === Number(event.sequence);
        const stateMatches = operation === "REQUEST" ? event.status === "active" : event.status === "cancelled";
        if (!sequenceMatches || !stateMatches) {
          await admin.from("calendar_invite_jobs").update({
            status: "sent_provider", provider: "superseded", provider_message_id: null,
            last_error: null, next_attempt_at: null, sent_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          }).eq("id", job.id);
          superseded++;
          results.push({ id: job.id, status: "superseded" });
          continue;
        }

        const { data: recipient, error: recipientError } = await admin
          .from("profiles").select("id,full_name,consultant_tag,email,active").eq("id", event.recipient_user_id).single();
        if (recipientError || !recipient) throw new Error(recipientError?.message || "Destinatário não encontrado");
        if (!recipient.active) throw new Error("Destinatário inativo no UniConecta");
        if (!recipient.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email)) throw new Error("Destinatário sem e-mail válido");

        const ics = buildIcs(event, recipient, operation, cfg.organizer, cfg.crmUrl);
        const info = await transport.sendMail({
          from: `UniConecta <${cfg.from}>`,
          to: recipient.email,
          subject: operation === "CANCEL" ? `Cancelado: ${event.title}` : event.title,
          text: `${event.title}\n\nConsulte os detalhes no UniConecta.`,
          icalEvent: { filename: "uniconecta.ics", method: operation, content: ics },
        });

        if (!Array.isArray(info.accepted) || info.accepted.length === 0) {
          throw new Error("O servidor de e-mail não aceitou o destinatário do convite.");
        }
        await admin.from("calendar_invite_jobs").update({
          status: "sent_provider", provider: cfg.provider,
          provider_message_id: String(info.messageId || ""), last_error: null, next_attempt_at: null,
          sent_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq("id", job.id);
        sent++;
        results.push({ id: job.id, status: "sent_provider" });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const delayMinutes = Math.min(240, Math.pow(2, Math.min(attempts, 6)) * 5);
        const nextAttempt = new Date(Date.now() + delayMinutes * 60_000).toISOString();
        await admin.from("calendar_invite_jobs").update({
          status: "failed", last_error: message.slice(0, 1000), next_attempt_at: nextAttempt, updated_at: new Date().toISOString(),
        }).eq("id", job.id);
        failed++;
        results.push({ id: job.id, status: "failed", error: message });
      }
    }

    return Response.json({
      ok: true, configured: true, selected: (jobs || []).length, processed: claimedCount,
      sent, failed, superseded, results, provider: cfg.provider, deliveryTracking: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("autentic") ? 401 : message.includes("inativo") ? 403 : 500;
    return Response.json({ ok: false, message }, { status });
  }
});