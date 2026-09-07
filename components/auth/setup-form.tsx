"use client"

import { useState } from "react"
import Link from "next/link"
import { bootstrapAdmin } from "@/app/actions/team"

const inputCls =
  "rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#88005b] focus:ring-2 focus:ring-[#88005b]/20"

export function SetupForm({ exigeEmail }: { exigeEmail: boolean }) {
  const [nome, setNome] = useState("")
  const [email, setEmail] = useState("")
  const [senha, setSenha] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    setSucesso(null)
    setCarregando(true)
    try {
      const r = await bootstrapAdmin({ fullName: nome, email, password: senha })
      if (r.ok) setSucesso(r.message)
      else setErro(r.message)
    } catch (err) {
      console.error("[v0] bootstrap error:", err)
      setErro("Não foi possível criar sua conta devido a um erro de configuração.")
    } finally {
      setCarregando(false)
    }
  }

  if (sucesso) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[#00302b]">{sucesso}</p>
        <Link href="/auth/login"
          className="rounded-md bg-[#88005b] px-4 py-2 text-center text-sm font-semibold text-white hover:bg-[#6d0049]">
          Ir para o login
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      {exigeEmail && (
        <p className="rounded-md bg-[#b4fcf1]/40 px-3 py-2 text-xs text-[#00302b]">
          Este ambiente exige que o e-mail coincida com INITIAL_ADMIN_EMAIL.
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="nome" className="text-xs font-medium text-slate-700">Nome completo</label>
        <input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)}
          className={inputCls} placeholder="Maria Gerente" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-xs font-medium text-slate-700">E-mail</label>
        <input id="email" type="email" required autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)} className={inputCls}
          placeholder="gerencia@unimetrocamp.com.br" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="senha" className="text-xs font-medium text-slate-700">Senha</label>
        <input id="senha" type="password" required autoComplete="new-password" value={senha}
          onChange={(e) => setSenha(e.target.value)} className={inputCls} placeholder="Mínimo 8 caracteres" />
      </div>
      {erro && <p className="text-sm text-[#ff1a00]" role="alert">{erro}</p>}
      <button type="submit" disabled={carregando}
        className="mt-1 rounded-md bg-[#88005b] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6d0049] disabled:opacity-60">
        {carregando ? "Criando…" : "Criar administrador"}
      </button>
      <Link href="/auth/login" className="self-start text-xs font-medium text-slate-500 underline-offset-4 hover:underline">
        Já tenho conta — voltar ao login
      </Link>
    </form>
  )
}
