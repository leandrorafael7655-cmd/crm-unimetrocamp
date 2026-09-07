/**
 * Geração centralizada de URLs de autenticação.
 *
 * Todos os fluxos (convite, recuperação de senha, confirmação de e-mail e
 * callback) devem usar estas funções para evitar URLs fixas de localhost em
 * produção. Em preview do v0, a variável NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL
 * roteia o callback do Supabase de volta para a VM.
 */

const CALLBACK_PATH = "/auth/callback"

/** Origem pública configurada por ambiente (sem barra final). */
export function siteUrl(): string | null {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null) ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
  if (!raw) return null
  return raw.replace(/\/+$/, "")
}

/**
 * URL de redirect para e-mails do Supabase.
 * Prioriza o proxy de desenvolvimento do v0; senão usa a origem informada
 * (origem do navegador no cliente, ou a origem pública no servidor).
 * `next` define o destino interno após o callback (ex.: /auth/reset-password).
 */
export function authRedirectUrl(currentOrigin?: string | null, next?: string): string {
  const devProxy = process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL
  const base = devProxy
    ? devProxy
    : `${(currentOrigin || siteUrl() || "").replace(/\/+$/, "")}${CALLBACK_PATH}`

  if (!next) return base
  const sep = base.includes("?") ? "&" : "?"
  return `${base}${sep}next=${encodeURIComponent(next)}`
}

/** Origem atual no navegador, com fallback seguro. */
export function browserOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin
  return siteUrl() || ""
}
