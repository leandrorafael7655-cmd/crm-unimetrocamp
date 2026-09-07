import "server-only"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Cliente administrativo do Supabase (service_role).
 *
 * NUNCA importe este módulo em código de cliente. O marcador "server-only"
 * gera erro de build caso isso aconteça. A service_role ignora RLS e só deve
 * ser usada dentro de Server Actions / Route Handlers com autorização própria.
 */
let cached: SupabaseClient | null = null

export function createAdminClient(): SupabaseClient {
  if (cached) return cached

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      "Configuração ausente: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.",
    )
  }

  cached = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return cached
}
