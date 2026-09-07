import { createHash, timingSafeEqual } from "node:crypto"

/**
 * Comparação em tempo constante resistente a timing attacks.
 *
 * `timingSafeEqual` LANÇA quando os buffers têm tamanhos diferentes, e esse
 * caminho de erro vazaria o comprimento do segredo. Para blindar isso, passamos
 * ambos os lados por SHA-256 antes de comparar: o digest tem sempre 32 bytes,
 * então os buffers têm comprimento idêntico e a função nunca lança por tamanho.
 */
export function comparacaoConstante(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest()
  const hb = createHash("sha256").update(b).digest()
  return timingSafeEqual(ha, hb)
}

export type ResultadoAuthCron =
  | { autorizado: true }
  | { autorizado: false; status: 401 | 503; error: string }

/**
 * Avalia a autorização de uma invocação de cron, separando explicitamente os
 * dois casos de recusa exigidos pelo contrato:
 *
 *   • CRON_SECRET ausente  → 503 (má configuração do servidor).
 *   • Authorization ausente/errado → 401 (não autorizado).
 *
 * Função pura (sem I/O, sem `process.env`) para permitir teste unitário direto.
 */
export function avaliarAuthCron(
  secret: string | undefined | null,
  authHeader: string | null,
): ResultadoAuthCron {
  if (!secret) {
    return { autorizado: false, status: 503, error: "CRON_SECRET não configurado" }
  }
  const esperado = `Bearer ${secret}`
  if (!authHeader || !comparacaoConstante(authHeader, esperado)) {
    return { autorizado: false, status: 401, error: "unauthorized" }
  }
  return { autorizado: true }
}
