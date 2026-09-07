import "server-only"

/**
 * Resolução de token Mapbox para uso SERVER-ONLY.
 *
 * Prefere MAPBOX_SECRET_TOKEN (idealmente sk...., ou um pk.... sem restrição de
 * URL). Se ausente OU rejeitado com 401/403 (token sem escopo/restrito por
 * domínio), cai para NEXT_PUBLIC_MAPBOX_TOKEN — que já é público, então o
 * fallback não expõe nenhum segredo novo. Nunca importe em código de cliente.
 */
export function tokensMapbox(): string[] {
  const secret = process.env.MAPBOX_SECRET_TOKEN?.trim()
  const publico = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim()
  return [secret, publico].filter((t): t is string => Boolean(t))
}

/** Espera `ms` milissegundos (para backoff). */
export function esperar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
