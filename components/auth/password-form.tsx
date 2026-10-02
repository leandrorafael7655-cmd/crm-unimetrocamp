"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { useRouter } from "next/navigation"
import { AuthShell } from "@/components/auth/auth-shell"
import { changeOwnPassword, completeAuthCallback, passwordResetAccess, saveRecoveredPassword } from "@/app/actions/password"
import { callbackInput, containsAuthCallback } from "@/lib/auth/callback-input"
import { PASSWORD_REQUIREMENTS, passwordValidation } from "@/lib/auth/password-policy"

function PasswordInput({ id, label, value, onChange, current = false }: { id: string; label: string; value: string; onChange: (value: string) => void; current?: boolean }) {
  const [visible, setVisible] = useState(false)
  return <div className="space-y-1.5">
    <label htmlFor={id} className="text-sm font-medium text-slate-700">{label}</label>
    <div className="relative">
      <input id={id} type={visible ? "text" : "password"} required minLength={current ? undefined : 12} maxLength={128}
        autoComplete={current ? "current-password" : "new-password"} value={value} onChange={e => onChange(e.target.value)}
        className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-3 pr-12 text-sm text-slate-900 focus:border-[#88005b] focus:outline-none focus:ring-2 focus:ring-[#88005b]/15" />
      <button type="button" onClick={() => setVisible(v => !v)} aria-label={`${visible ? "Ocultar" : "Mostrar"} ${label.toLowerCase()}`} aria-pressed={visible}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-xl text-slate-500 hover:text-[#88005b]">
        {visible ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
      </button>
    </div>
  </div>
}

export function PasswordForm({ own = false }: { own?: boolean }) {
  const router = useRouter()
  const started = useRef(false)
  const [checking, setChecking] = useState(!own)
  const [allowed, setAllowed] = useState(own)
  const [required, setRequired] = useState(false)
  const [error, setError] = useState("")
  const [current, setCurrent] = useState("")
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (own || started.current) return
    started.current = true
    const validate = async () => {
      const input = callbackInput(window.location.search, window.location.hash)
      if (containsAuthCallback(input)) {
        window.history.replaceState(null, "", "/auth/reset-password")
        const result = await completeAuthCallback({ ...input, next: "/auth/reset-password" })
        if (!result.ok) { setError(result.message); setAllowed(false); return }
      }
      const access = await passwordResetAccess()
      setAllowed(access.allowed)
      setRequired(access.required)
      if (!access.allowed) setError("O link é inválido, expirou ou já foi utilizado. Solicite um novo link de recuperação.")
    }
    validate().catch(() => { setAllowed(false); setError("Não foi possível validar seu acesso. Solicite outro link.") }).finally(() => setChecking(false))
  }, [own])
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const validation = passwordValidation(password, confirmation)
    if (validation) { setError(validation); return }
    setBusy(true); setError("")
    try {
      const result = own ? await changeOwnPassword(current, password, confirmation) : await saveRecoveredPassword(password, confirmation)
      if (!result.ok) { setError(result.message); return }
      setCurrent(""); setPassword(""); setConfirmation("")
      router.replace(`/auth/login?msg=${encodeURIComponent(result.message)}`)
      router.refresh()
    } catch { setError("Não foi possível concluir a atualização. Tente novamente.") }
    finally { setBusy(false) }
  }
  return <AuthShell titulo={own ? "Alterar minha senha" : "Redefinir senha"}
    subtitulo={required ? "Sua senha é temporária. Escolha uma senha pessoal antes de acessar o CRM." : own ? "Confirme sua senha atual para validar sua identidade." : "Escolha uma nova senha para seu acesso ao UniConecta."}>
    {checking ? <p role="status" className="text-sm text-slate-600">Validando seu acesso…</p> : !allowed ? <div className="space-y-4">
      <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>
      <Link href="/auth/login?modo=recuperar" className="inline-flex rounded-xl bg-[#88005b] px-4 py-3 text-sm font-semibold text-white">Solicitar outro link</Link>
    </div> : <form onSubmit={submit} className="space-y-4">
      {own && <PasswordInput id="current-password" label="Senha atual" value={current} onChange={setCurrent} current />}
      <PasswordInput id="new-password" label="Nova senha" value={password} onChange={setPassword} />
      <PasswordInput id="confirm-password" label="Confirmar nova senha" value={confirmation} onChange={setConfirmation} />
      <p className="text-xs leading-relaxed text-slate-500">{PASSWORD_REQUIREMENTS} Escolha uma senha diferente da anterior.</p>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <button type="submit" disabled={busy} className="h-11 w-full rounded-xl bg-[#88005b] px-4 text-sm font-semibold text-white hover:bg-[#72004d] disabled:opacity-60">{busy ? "Salvando…" : "Salvar nova senha"}</button>
      {own && <Link href="/perfil" className="block text-center text-sm text-slate-600 underline">Voltar ao perfil</Link>}
    </form>}
  </AuthShell>
}
