import { NextResponse } from "next/server"
import { fecharSemanas } from "@/lib/data/weekly-close"
import { avaliarAuthCron } from "@/lib/auth/cron-auth"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Fechamento semanal de aderência B2B.
 * Agendado via Vercel Cron: segunda 06:00 UTC (03:00 America/Sao_Paulo).
 * Idempotente: reexecutar no mesmo dia não altera snapshots já congelados.
 *
 * Autenticação (o Vercel Cron envia `Authorization: Bearer $CRON_SECRET`):
 *   • CRON_SECRET ausente          → 503 (má configuração do servidor).
 *   • Authorization ausente/errado → 401 (não autorizado).
 * A comparação do segredo é em tempo constante (ver lib/auth/cron-auth).
 */
export async function GET(request: Request) {
  const auth = avaliarAuthCron(process.env.CRON_SECRET, request.headers.get("authorization"))
  if (!auth.autorizado) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  }

  try {
    const resultado = await fecharSemanas(12)
    return NextResponse.json({ ok: true, ...resultado, at: new Date().toISOString() })
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro desconhecido"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
