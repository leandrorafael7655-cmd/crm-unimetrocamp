import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

function isPublicPage(pathname: string): boolean {
  return (
    pathname === "/auth" ||
    pathname.startsWith("/auth/") ||
    pathname === "/demo" ||
    pathname.startsWith("/demo/") ||
    pathname === "/setup" ||
    pathname.startsWith("/setup/")
  )
}

function copySessionCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie)
  }
  return to
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  // Create a fresh SSR client for every request. This keeps the browser cookie
  // state and the Server Components session in sync on Vercel/Fluid Compute.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))

          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Keep this immediately after createServerClient. getUser validates/refreshes
  // the auth session and may write refreshed cookies to supabaseResponse.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname, search } = request.nextUrl
  const isApiRoute = pathname.startsWith("/api/")

  // API routes keep their own 401/403 semantics. For browser pages, never let
  // an unauthenticated request reach Server Components that call requireActor(),
  // otherwise Next renders a 500 with "Não autenticado.".
  if (!user && !isApiRoute && !isPublicPage(pathname)) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/auth/login"
    loginUrl.search = ""
    loginUrl.searchParams.set("next", `${pathname}${search}`)

    return copySessionCookies(supabaseResponse, NextResponse.redirect(loginUrl))
  }

  return supabaseResponse
}
