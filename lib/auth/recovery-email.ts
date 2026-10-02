import "server-only"
import { createClient } from "@supabase/supabase-js"
import { authRedirectUrl } from "@/lib/auth/urls"

export function recoveryRedirectUrl(): string {
  // Never derive an email destination from an untrusted Host header or a preview URL.
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  const origin = configured && !configured.includes("unimetrocamp.vercel.app")
    ? new URL(configured).origin
    : "https://uniconecta-crm.vercel.app"
  return authRedirectUrl(origin, "/auth/reset-password")
}

export function recoveryEmailClient() {
  // An implicit email link works when opened on a different device/browser.
  // No PKCE verifier is stored in the browser that requested the email.
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
