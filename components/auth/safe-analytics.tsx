"use client"

import { Analytics } from "@vercel/analytics/next"

export function SafeAnalytics() {
  return <Analytics beforeSend={event => {
    const url = new URL(event.url)
    if (url.pathname.startsWith("/auth") || url.pathname.startsWith("/perfil")) return null
    // Recovery tokens are never included in analytics, even if a provider falls back to Site URL.
    if (url.hash || ["code", "token_hash", "access_token", "refresh_token", "token"].some(key => url.searchParams.has(key))) return null
    return event
  }} />
}
