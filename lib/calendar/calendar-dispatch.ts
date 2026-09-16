import type { SupabaseClient } from "@supabase/supabase-js"

export interface CalendarDispatchResult {
  configured: boolean
  processed: number
  sent: number
  failed: number
  superseded: number
  error?: string
}

/**
 * Processa a fila de convites sem transformar falha de e-mail em falha da ação
 * comercial que acabou de ser salva. A criação/alteração da ação é a fonte de
 * verdade; o envio é assíncrono e pode ser reprocessado depois.
 */
export async function flushCalendarQueue(
  supabase: SupabaseClient,
  options: { batches?: number; limit?: number } = {},
): Promise<CalendarDispatchResult> {
  const batches = Math.max(1, Math.min(4, options.batches ?? 2))
  const limit = Math.max(1, Math.min(50, options.limit ?? 25))

  try {
    const { data: status, error: statusError } = await supabase.functions.invoke("send-calendar-invites", {
      body: { action: "status" },
    })

    if (statusError) {
      return { configured: false, processed: 0, sent: 0, failed: 0, superseded: 0, error: statusError.message }
    }
    if (!status?.configured) {
      return { configured: false, processed: 0, sent: 0, failed: 0, superseded: 0 }
    }

    let processed = 0
    let sent = 0
    let failed = 0
    let superseded = 0

    for (let batch = 0; batch < batches; batch++) {
      const { data, error } = await supabase.functions.invoke("send-calendar-invites", {
        body: { action: "process", limit },
      })
      if (error) {
        return { configured: true, processed, sent, failed, superseded, error: error.message }
      }

      const batchProcessed = Number(data?.processed || 0)
      processed += batchProcessed
      sent += Number(data?.sent || 0)
      failed += Number(data?.failed || 0)
      superseded += Number(data?.superseded || 0)

      if (Number(data?.selected || batchProcessed) < limit) break
    }

    return { configured: true, processed, sent, failed, superseded }
  } catch (error) {
    return {
      configured: false,
      processed: 0,
      sent: 0,
      failed: 0,
      superseded: 0,
      error: error instanceof Error ? error.message : "Falha ao processar fila de calendário.",
    }
  }
}
