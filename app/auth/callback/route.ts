import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

/** Garante que o destino seja um caminho interno seguro. */
function safeNext(next: string | null): string {
  if (!next) return "/"
  if (!next.startsWith("/") || next.startsWith("//")) return "/"
  return next
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get("code")
  const next = safeNext(searchParams.get("next"))
  const errorParam = searchParams.get("error")
  const errorCode = searchParams.get("error_code")

  // O Supabase pode retornar erro diretamente na URL (link expirado, etc.).
  if (errorParam) {
    const motivo =
      errorCode === "otp_expired" || /expired|used/i.test(errorParam)
        ? "link-invalido"
        : "callback-falhou"
    return NextResponse.redirect(`${origin}/auth/login?erro=${motivo}`)
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?erro=callback-falhou`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error("[v0] exchangeCodeForSession error:", error.message)
    const motivo = /expired|used|invalid/i.test(error.message) ? "link-invalido" : "callback-falhou"
    return NextResponse.redirect(`${origin}/auth/login?erro=${motivo}`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
