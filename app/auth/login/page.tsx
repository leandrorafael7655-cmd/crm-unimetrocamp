"use client"

import { createClient } from "@/lib/supabase/client"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useMemo, useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { AuthShell } from "@/components/auth/auth-shell"
import { authRedirectUrl, browserOrigin } from "@/lib/auth/urls"

type Modo = "login" | "recuperar" | "reenviar"

function mensagemDeCodigo(code?: string, status?: number): string {
  switch (code) {
    case "email_not_confirmed":
      return "Seu e-mail ainda não foi confirmado."
    case "invalid_credentials":
      return "E-mail ou senha incorretos."
    case "user_banned":
      return "Seu acesso está desativado. Procure a gerência."
    case "over_request_rate_limit":
      return "Muitas tentativas. Aguarde um instante e tente novamente."
    default:
      if (status === 429) return "Muitas tentativas. Aguarde um instante e tente novamente."
      return "Não foi possível entrar. Verifique os dados e tente novamente."
  }
}

function destinoSeguro(next: string | null): string {
  if (!next) return "/dashboard"
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard"
  if (next.startsWith("/auth/")) return "/dashboard"
  return next
}

const MENSAGENS_URL: Record<string, string> = {
  "sem-perfil": "Não encontramos um perfil vinculado a esta conta. Procure a gerência.",
  inativo: "Seu acesso está desativado. Procure a gerência.",
  "link-invalido": "O link expirou ou já foi utilizado.",
  "callback-falhou": "Não foi possível concluir a autenticação. Tente novamente.",
  "config-erro": "Não foi possível criar sua conta devido a um erro de configuração.",
}

const inputCls =
  "h-11 w-full rounded-xl border border-[#ded1d9] bg-white px-3.5 text-sm text-slate-900 shadow-[0_1px_2px_rgba(36,21,31,0.02)] outline-none transition placeholder:text-slate-400 hover:border-[#cdbbc5] focus:border-[#88005b] focus:ring-3 focus:ring-[#88005b]/10"

function LoginInner() {
  const router = useRouter()
  const params = useSearchParams()
  const destino = useMemo(() => destinoSeguro(params.get("next")), [params])

  const [modo, setModo] = useState<Modo>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [precisaConfirmar, setPrecisaConfirmar] = useState(false)

  useEffect(() => {
    const e = params.get("erro")
    const m = params.get("msg")
    if (e && MENSAGENS_URL[e]) setErro(MENSAGENS_URL[e])
    if (m) setAviso(m)
  }, [params])

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault()
    setCarregando(true)
    setErro(null)
    setAviso(null)
    setPrecisaConfirmar(false)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        const { code, status } = error as { code?: string; status?: number }
        if (code === "email_not_confirmed") setPrecisaConfirmar(true)
        throw error
      }
      router.push(destino)
      router.refresh()
    } catch (err) {
      const { code, status } = (err ?? {}) as { code?: string; status?: number }
      console.error("[auth] login error:", err)
      setErro(mensagemDeCodigo(code, status))
    } finally {
      setCarregando(false)
    }
  }

  const recuperar = async (e: React.FormEvent) => {
    e.preventDefault()
    setCarregando(true)
    setErro(null)
    setAviso(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: authRedirectUrl(browserOrigin(), "/auth/reset-password"),
      })
      if (error) throw error
      setAviso("Se existir uma conta com este e-mail, enviaremos um link para redefinir a senha.")
    } catch (err) {
      console.error("[auth] reset error:", err)
      setAviso("Se existir uma conta com este e-mail, enviaremos um link para redefinir a senha.")
    } finally {
      setCarregando(false)
    }
  }

  const reenviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setCarregando(true)
    setErro(null)
    setAviso(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: authRedirectUrl(browserOrigin(), "/dashboard") },
      })
      if (error) throw error
      setAviso("Se o e-mail estiver pendente de confirmação, reenviamos o link de acesso.")
    } catch (err) {
      console.error("[auth] resend error:", err)
      setAviso("Se o e-mail estiver pendente de confirmação, reenviamos o link de acesso.")
    } finally {
      setCarregando(false)
    }
  }

  const titulos: Record<Modo, { titulo: string; subtitulo: string }> = {
    login: { titulo: "Bem-vindo ao UniConecta", subtitulo: "Acesse sua conta para continuar." },
    recuperar: { titulo: "Recuperar senha", subtitulo: "Enviaremos um link seguro para você definir uma nova senha." },
    reenviar: { titulo: "Confirmar e-mail", subtitulo: "Reenvie o link de confirmação para concluir seu acesso." },
  }

  return (
    <AuthShell titulo={titulos[modo].titulo} subtitulo={titulos[modo].subtitulo}>
      {modo === "login" && (
        <form onSubmit={entrar} className="flex flex-col gap-4.5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-slate-700">E-mail corporativo</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              placeholder="seu.email@empresa.com.br"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="password" className="text-sm font-medium text-slate-700">Senha</label>
              <button
                type="button"
                onClick={() => { setModo("recuperar"); setErro(null); setAviso(null) }}
                className="rounded text-xs font-semibold text-[#88005b] underline-offset-4 hover:underline"
              >
                Esqueci minha senha
              </button>
            </div>
            <div className="relative">
              <input
                id="password"
                type={mostrarSenha ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputCls} pr-11`}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setMostrarSenha((atual) => !atual)}
                className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-xl text-slate-400 transition hover:text-[#88005b] focus-visible:text-[#88005b]"
                aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={mostrarSenha}
              >
                {mostrarSenha ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
              </button>
            </div>
          </div>

          {erro && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700" role="alert">
              {erro}
            </p>
          )}
          {aviso && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800" role="status">
              {aviso}
            </p>
          )}

          {precisaConfirmar && (
            <button
              type="button"
              onClick={() => { setModo("reenviar"); setErro(null) }}
              className="self-start rounded text-xs font-semibold text-[#88005b] underline-offset-4 hover:underline"
            >
              Reenviar e-mail de confirmação
            </button>
          )}

          <button
            type="submit"
            disabled={carregando}
            className="mt-1 h-11 rounded-xl bg-[#88005b] px-4 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(136,0,91,0.18)] transition hover:bg-[#72004d] focus-visible:ring-3 focus-visible:ring-[#88005b]/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {carregando ? "Entrando…" : "Entrar"}
          </button>

          <button
            type="button"
            onClick={() => { setModo("reenviar"); setErro(null); setAviso(null) }}
            className="mx-auto rounded text-xs font-medium text-slate-500 underline-offset-4 transition hover:text-[#88005b] hover:underline"
          >
            Reenviar confirmação de e-mail
          </button>
        </form>
      )}

      {modo !== "login" && (
        <form onSubmit={modo === "recuperar" ? recuperar : reenviar} className="flex flex-col gap-4.5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email2" className="text-sm font-medium text-slate-700">E-mail corporativo</label>
            <input
              id="email2"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              placeholder="seu.email@empresa.com.br"
            />
          </div>
          {erro && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700" role="alert">{erro}</p>}
          {aviso && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800" role="status">{aviso}</p>}
          <button
            type="submit"
            disabled={carregando}
            className="mt-1 h-11 rounded-xl bg-[#88005b] px-4 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(136,0,91,0.18)] transition hover:bg-[#72004d] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {carregando ? "Enviando…" : modo === "recuperar" ? "Enviar link de redefinição" : "Reenviar confirmação"}
          </button>
          <button
            type="button"
            onClick={() => { setModo("login"); setErro(null); setAviso(null) }}
            className="self-start rounded text-xs font-semibold text-[#88005b] underline-offset-4 hover:underline"
          >
            Voltar ao login
          </button>
        </form>
      )}

      <div className="mt-7 border-t border-[#f0e6ec] pt-5">
        <p className="text-[11px] leading-relaxed text-slate-400">UniConecta · Acesso exclusivo de usuários autorizados.</p>
      </div>
    </AuthShell>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  )
}
