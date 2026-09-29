import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { requireCan } from "@/lib/auth/guards"
import { comparacaoConstante } from "@/lib/auth/cron-auth"
import { exchangeMicrosoftToken, storeMicrosoftAccount, unseal } from "@/lib/meetings/microsoft"

export async function GET(request: NextRequest) {
  const jar = await cookies(),
    raw = jar.get("uc-ms-oauth")?.value
  jar.set("uc-ms-oauth", "", {
    path: "/api/microsoft",
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  })
  const target = new URL("/", process.env.MICROSOFT_REDIRECT_URI || request.url)
  try {
    const actor = await requireCan("b2b.write")
    if (!raw || !actor.email) throw new Error("Conexão expirada. Tente vincular novamente.")
    const saved = JSON.parse(unseal(raw, "oauth")) as {
      userId: string
      state: string
      verifier: string
      expires: number
    }
    const code = request.nextUrl.searchParams.get("code"),
      state = request.nextUrl.searchParams.get("state") || ""
    if (
      !code ||
      saved.userId !== actor.id ||
      saved.expires < Date.now() ||
      !comparacaoConstante(state, saved.state)
    )
      throw new Error("Conexão não autorizada ou expirada. Tente novamente.")
    const token = await exchangeMicrosoftToken({
      grant_type: "authorization_code",
      code,
      code_verifier: saved.verifier,
      redirect_uri: process.env.MICROSOFT_REDIRECT_URI!,
    })
    await storeMicrosoftAccount(actor.id, actor.email, token)
    target.searchParams.set("microsoft", "connected")
  } catch {
    // Do not put authorization codes, provider messages or credentials in URLs/logs.
    target.searchParams.set("microsoft", "error")
  }
  return NextResponse.redirect(target)
}
