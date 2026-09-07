"use client"

import { createClient } from "@/lib/supabase/client"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"
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

const MENSAGENS_URL: Record<string, string> = {
  "sem-perfil": "Não encontramos um perfil vinculado a esta conta. Procure a gerência.",
  inativo: "Seu acesso está desativado. Procure a gerência.",
  "link-invalido": "O link expirou ou já foi utilizado.",
  "callback-falhou": "Não foi possível concluir a autenticação. Tente novamente.",
  "config-erro": "Não foi possível criar sua conta devido a um erro de configuração.",
}

const inputCls =
  "rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#88005b] focus:ring-2 focus:ring-[#88005b]/20"

function LoginInner() {
  const router = useRouter()
  const params = useSearchParams()

  const [modo, setModo] = useState<Modo>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
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
      router.push("/")
      router.refresh()
    } catch (err) {
      const { code, status } = (err ?? {}) as { code?: string; status?: number }
      console.error("[v0] login error:", err)
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
        redirectTo: authRedirectUrl(browserOrigin()),
      })
      if (error) throw error
      setAviso("Se existir uma conta com este e-mail, enviaremos um link. Não recebeu? Peça à gerência para redefinir seu acesso.")
    } catch (err) {
      console.error("[v0] reset error:", err)
      setAviso("Se existir uma conta com este e-mail, enviaremos um link. Não recebeu? Peça à gerência para redefinir seu acesso.")
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
        options: { emailRedirectTo: authRedirectUrl(browserOrigin()) },
      })
      if (error) throw error
      setAviso("Se o e-mail estiver pendente de confirmação, reenviamos o link de acesso.")
    } catch (err) {
      console.error("[v0] resend error:", err)
      setAviso("Se o e-mail estiver pendente de confirmação, reenviamos o link de acesso.")
    } finally {
      setCarregando(false)
    }
  }

  const titulos: Record<Modo, { titulo: string; subtitulo: string }> = {
    login: { titulo: "Entrar", subtitulo: "Acesso restrito à equipe comercial da unidade." },
    recuperar: { titulo: "Recuperar senha", subtitulo: "Enviaremos um link para redefinir sua senha." },
    reenviar: { titulo: "Reenviar confirmação", subtitulo: "Reenvie o link de confirmação de e-mail." },
  }

  return (
    <AuthShell titulo={titulos[modo].titulo} subtitulo={titulos[modo].subtitulo}>
      {modo === "login" && (
        <form onSubmit={entrar} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-medium text-slate-700">E-mail</label>
            <input id="email" type="email" required autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} className={inputCls}
              placeholder="voce@unimetrocamp.com.br" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-medium text-slate-700">Senha</label>
            <input id="password" type="password" required autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="••••••••" />
          </div>
          {erro && <p className="text-sm text-[#ff1a00]" role="alert">{erro}</p>}
          {aviso && <p className="text-sm text-[#00302b]" role="status">{aviso}</p>}
          {precisaConfirmar && (
            <button type="button" onClick={() => { setModo("reenviar"); setErro(null) }}
              className="self-start text-xs font-medium text-[#88005b] underline-offset-4 hover:underline">
              Reenviar e-mail de confirmação
            </button>
          )}
          <button type="submit" disabled={carregando}
            className="mt-1 rounded-md bg-[#88005b] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6d0049] disabled:opacity-60">
            {carregando ? "Entrando…" : "Entrar"}
          </button>
          <div className="flex items-center justify-between text-xs">
            <button type="button" onClick={() => { setModo("recuperar"); setErro(null); setAviso(null) }}
              className="font-medium text-slate-500 underline-offset-4 hover:underline">Esqueci minha senha</button>
            <button type="button" onClick={() => { setModo("reenviar"); setErro(null); setAviso(null) }}
              className="font-medium text-slate-500 underline-offset-4 hover:underline">Reenviar confirmação</button>
          </div>
        </form>
      )}

      {modo !== "login" && (
        <form onSubmit={modo === "recuperar" ? recuperar : reenviar} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email2" className="text-xs font-medium text-slate-700">E-mail</label>
            <input id="email2" type="email" required autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} className={inputCls}
              placeholder="voce@unimetrocamp.com.br" />
          </div>
          {erro && <p className="text-sm text-[#ff1a00]" role="alert">{erro}</p>}
          {aviso && <p className="text-sm text-[#00302b]" role="status">{aviso}</p>}
          <button type="submit" disabled={carregando}
            className="mt-1 rounded-md bg-[#88005b] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6d0049] disabled:opacity-60">
            {carregando ? "Enviando…" : modo === "recuperar" ? "Enviar link de redefinição" : "Reenviar confirmação"}
          </button>
          <button type="button" onClick={() => { setModo("login"); setErro(null); setAviso(null) }}
            className="self-start text-xs font-medium text-slate-500 underline-offset-4 hover:underline">
            Voltar ao login
          </button>
        </form>
      )}

      <div className="mt-6 border-t border-slate-100 pt-4">
        <p className="text-center text-xs text-slate-400">
          Só explorando?{" "}
          <Link href="/demo" className="font-medium text-slate-500 underline-offset-4 hover:underline">
            Abrir modo demonstração
          </Link>
        </p>
        <p className="mt-2 text-center text-xs text-slate-300">
          <Link href="/setup" className="underline-offset-4 hover:underline">Primeiro acesso — configurar administrador</Link>
        </p>
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
