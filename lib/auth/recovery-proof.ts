import "server-only"
import { createHmac, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"

const NAME = "uniconecta-recovery"
const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 1200 }

function signature(payload: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error("Configuração de autenticação indisponível.")
  return createHmac("sha256", key).update(payload).digest("base64url")
}

export async function grantRecovery(userId: string, sessionId: string) {
  const payload = Buffer.from(JSON.stringify({ userId, sessionId, expires: Date.now() + options.maxAge * 1000 })).toString("base64url")
  ;(await cookies()).set(NAME, `${payload}.${signature(payload)}`, options)
}

export async function clearRecovery() {
  ;(await cookies()).set(NAME, "", { ...options, maxAge: 0 })
}

export async function hasRecovery(userId: string, sessionId: string): Promise<boolean> {
  const value = (await cookies()).get(NAME)?.value
  if (!value) return false
  try {
    const [payload, signed, extra] = value.split(".")
    if (!payload || !signed || extra) return false
    const expected = Buffer.from(signature(payload))
    const received = Buffer.from(signed)
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return false
    const proof = JSON.parse(Buffer.from(payload, "base64url").toString())
    return proof.userId === userId && proof.sessionId === sessionId && proof.expires > Date.now()
  } catch {
    return false
  }
}
