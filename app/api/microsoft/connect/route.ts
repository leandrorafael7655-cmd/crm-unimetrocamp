import { randomBytes, createHash } from "node:crypto"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { requireCan } from "@/lib/auth/guards"
import { microsoftConfig, MICROSOFT_SCOPES, seal } from "@/lib/meetings/microsoft"

export async function GET() {
  try {
    const actor = await requireCan("b2b.write")
    if (!actor.email || !microsoftConfig().configured)
      throw new Error("Integração Microsoft ou e-mail corporativo não configurado.")
    const state = randomBytes(32).toString("base64url"),
      verifier = randomBytes(48).toString("base64url")
    const jar = await cookies()
    jar.set(
      "uc-ms-oauth",
      seal(JSON.stringify({ state, verifier, userId: actor.id, expires: Date.now() + 600000 }), "oauth"),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/api/microsoft",
        maxAge: 600,
      },
    )
    const url = new URL(
      `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize`,
    )
    url.search = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      redirect_uri: process.env.MICROSOFT_REDIRECT_URI!,
      response_type: "code",
      response_mode: "query",
      scope: MICROSOFT_SCOPES,
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      login_hint: actor.email,
      prompt: "select_account",
    }).toString()
    return NextResponse.redirect(url)
  } catch {
    return new Response(
      "Não foi possível iniciar a conexão Microsoft. Volte ao CRM e confira sua sessão e a configuração da integração.",
      { status: 400 },
    )
  }
}
