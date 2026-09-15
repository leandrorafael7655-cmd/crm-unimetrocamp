import { createAdminClient } from "@/lib/supabase/admin"

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get("authorization") === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ ok: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const { data: status, error: statusError } = await admin.functions.invoke("send-calendar-invites", {
      body: { action: "status" },
    })

    if (statusError) {
      return Response.json({ ok: false, message: "Falha ao consultar o provedor de calendário." }, { status: 502 })
    }

    if (!status?.configured) {
      return Response.json({
        ok: true,
        configured: false,
        processed: 0,
        sent: 0,
        failed: 0,
        superseded: 0,
        message: "Provedor de calendário ainda não configurado; fila preservada.",
      })
    }

    let processed = 0
    let sent = 0
    let failed = 0
    let superseded = 0

    for (let batch = 0; batch < 4; batch++) {
      const { data, error } = await admin.functions.invoke("send-calendar-invites", {
        body: { action: "process", limit: 50 },
      })
      if (error) {
        return Response.json({ ok: false, configured: true, processed, sent, failed, superseded, message: error.message }, { status: 502 })
      }

      const selected = Number(data?.selected ?? data?.processed ?? 0)
      processed += Number(data?.processed || 0)
      sent += Number(data?.sent || 0)
      failed += Number(data?.failed || 0)
      superseded += Number(data?.superseded || 0)

      if (selected < 50) break
    }

    return Response.json({ ok: true, configured: true, processed, sent, failed, superseded })
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "Falha ao processar convites." },
      { status: 500 },
    )
  }
}
