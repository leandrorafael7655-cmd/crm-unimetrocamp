import type { SupabaseClient } from "@supabase/supabase-js"
import { dispatchCalendarInvites } from "@/app/actions/calendar-invites"

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
  // Homologação pode validar a fila persistida sem contatar provedores ou destinatários.
  if (process.env.UNICONECTA_DISABLE_EXTERNAL_COMMUNICATIONS === "true") {
    return { configured: false, processed: 0, sent: 0, failed: 0, superseded: 0 }
  }
  try {
    // Authenticated Server Action; SMTP credentials remain only in Vercel.
    void supabase; void options
    return await dispatchCalendarInvites()
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
