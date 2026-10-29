import { processSmtpQueue } from "@/lib/calendar/smtp-worker"
export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return Response.json({ ok: false, message: "Unauthorized" }, { status: 401 })
  const result = await processSmtpQueue({ limit: 10 })
  return Response.json({ ok: !result.error, ...result }, { status: result.error ? 502 : 200 })
}
