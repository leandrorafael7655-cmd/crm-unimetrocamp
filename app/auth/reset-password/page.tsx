"use client"

import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { AuthShell } from "@/components/auth/auth-shell"

const inputCls =
  "rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#88005b] focus:ring-2 focus:ring-[#88005b]/20"

export default function ResetPasswordPage() {
  const router = useRouter()
  const [senha, setSenha] = useState("")
  const [confirma, setConfirma] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [semSessao, setSemSessao] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) setSemSessao(true)
    })
  }, [])

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    if (senha.length < 8) return setErro("A senha deve ter ao menos 8 caracteres.")
    if (senha !== confirma) return setErro("As senhas não coincidem.")

    setCarregando(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password: senha })
      if (error) throw error
      router.push("/")
      router.refresh()
    } catch (err) {
      console.error("[v0] update password error:", err)
      setErro("Não foi possível definir a senha. O link pode ter expirado.")
    } finally {
      setCarregando(false)
    }
  }

  return (
    <AuthShell titulo="Definir nova senha" subtitulo="Escolha uma senha pessoal para o seu acesso ao CRM.">
      {semSessao ? (
        <p className="text-sm text-[#ff1a00]">
          Sua sessão expirou. Entre com sua senha atual (ou a provisória que a gerência informou) e tente novamente.
        </p>
      ) : (
        <form onSubmit={salvar} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="senha" className="text-xs font-medium text-slate-700">Nova senha</label>
            <input id="senha" type="password" required autoComplete="new-password" value={senha}
              onChange={(e) => setSenha(e.target.value)} className={inputCls} placeholder="Mínimo 8 caracteres" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirma" className="text-xs font-medium text-slate-700">Confirmar senha</label>
            <input id="confirma" type="password" required autoComplete="new-password" value={confirma}
              onChange={(e) => setConfirma(e.target.value)} className={inputCls} placeholder="Repita a senha" />
          </div>
          {erro && <p className="text-sm text-[#ff1a00]" role="alert">{erro}</p>}
          <button type="submit" disabled={carregando}
            className="mt-1 rounded-md bg-[#88005b] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6d0049] disabled:opacity-60">
            {carregando ? "Salvando…" : "Salvar e entrar"}
          </button>
        </form>
      )}
    </AuthShell>
  )
}
