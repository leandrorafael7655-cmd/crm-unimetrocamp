"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AuthShell } from "@/components/auth/auth-shell"
import { callbackInput } from "@/lib/auth/callback-input"
import { completeAuthCallback } from "@/app/actions/password"

export default function AuthCallbackPage() {
  const router = useRouter()
  const started = useRef(false)
  const [error, setError] = useState("")
  useEffect(() => {
    if (started.current) return
    started.current = true
    const input = callbackInput(window.location.search, window.location.hash)
    window.history.replaceState(null, "", "/auth/callback")
    completeAuthCallback(input).then(result => {
      window.history.replaceState(null, "", "/auth/callback")
      if (result.ok && result.destination) router.replace(result.destination)
      else { setError(result.message); router.replace("/auth/callback") }
    }).catch(() => {
      window.history.replaceState(null, "", "/auth/callback")
      setError("Não foi possível validar o link. Solicite uma nova recuperação.")
      router.replace("/auth/callback")
    })
  }, [router])
  return <AuthShell titulo="Validar link de acesso" subtitulo="Estamos validando seu link no provedor de autenticação.">
    {error ? <div className="space-y-4">
      <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>
      <Link href="/auth/login?modo=recuperar" className="inline-flex rounded-xl bg-[#88005b] px-4 py-3 text-sm font-semibold text-white">Solicitar outro link</Link>
    </div> : <p role="status" className="text-sm text-slate-600">Validando seu acesso…</p>}
  </AuthShell>
}
