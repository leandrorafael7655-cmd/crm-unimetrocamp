import { updateSession } from "@/lib/supabase/proxy"
import { legacySiteRedirect } from "@/lib/auth/site-redirect"
import { NextResponse, type NextRequest } from "next/server"

export async function proxy(request: NextRequest) {
  const destination = legacySiteRedirect(request.nextUrl, request.method)
  if (destination) return NextResponse.redirect(destination, 307)
  return updateSession(request)
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
