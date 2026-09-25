const LEGACY_HOST = "unimetrocamp.vercel.app"

/** Ativar somente depois de validar o novo domínio e as URLs do Supabase. */
export function legacySiteRedirect(
  current: URL,
  method: string,
  options = {
    enabled: process.env.UNICONECTA_REDIRECT_LEGACY_HOST === "true",
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  },
): URL | null {
  if (!options.enabled || !options.siteUrl || current.hostname !== LEGACY_HOST) return null
  if (method !== "GET" && method !== "HEAD") return null

  // Links já enviados usam cookies PKCE do domínio antigo. APIs e Server Actions
  // também precisam terminar na origem em que a operação foi iniciada.
  if (/^\/(auth|api|_next)(\/|$)/.test(current.pathname)) return null

  try {
    const target = new URL(options.siteUrl)
    if (target.protocol !== "https:" || target.username || target.password) return null
    if (target.hostname === LEGACY_HOST || target.pathname !== "/" || target.search || target.hash) return null
    target.pathname = current.pathname
    target.search = current.search
    return target
  } catch {
    return null
  }
}
