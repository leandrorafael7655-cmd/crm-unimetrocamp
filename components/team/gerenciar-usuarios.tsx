"use client"

import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Usuario } from "@/lib/domain/types"
import { type Role, rotuloRole, normalizeRole } from "@/lib/domain/roles"
import {
  inviteUser,
  resendInvite,
  changeRole,
  setActive,
  resetPassword,
  runDiagnostics,
  fixMissingProfile,
  type ActionResult,
  type Credenciais,
  type Diagnostic,
} from "@/app/actions/team"

function CampoCopiavel({ rotulo, valor }: { rotulo: string; valor: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[#00302b]/70">
        {rotulo}
      </span>
      <input
        readOnly
        value={valor}
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 rounded border border-[#00302b]/20 bg-white px-2 py-1 font-mono text-[11px] text-slate-700"
      />
      <button
        type="button"
        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(valor)
            setCopiado(true)
            setTimeout(() => setCopiado(false), 1800)
          } catch {
            setCopiado(false)
          }
        }}
      >
        {copiado ? "Copiado!" : "Copiar"}
      </button>
    </div>
  )
}

interface PerfilLinha {
  id: string
  full_name: string
  email: string | null
  role: Role
  active: boolean
  consultant_tag: string | null
}

const input =
  "rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-[#88005b] focus:ring-2 focus:ring-[#88005b]/20"
const btn =
  "rounded-md bg-[#88005b] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#6d0049] disabled:opacity-60"
const btnNeutro =
  "rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"

export function GerenciarUsuarios({ perfil }: { perfil: Usuario }) {
  const [supabase] = useState(() => createClient())
  const ehGerente = perfil.role === "gerente"

  const [linhas, setLinhas] = useState<PerfilLinha[]>([])
  const [carregando, setCarregando] = useState(true)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string; cred?: Credenciais } | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const [nome, setNome] = useState("")
  const [email, setEmail] = useState("")
  const [papel, setPapel] = useState<Role>("consultor_b2b")
  const [tag, setTag] = useState("")

  const [diag, setDiag] = useState<Diagnostic[] | null>(null)
  const [diagLoading, setDiagLoading] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, active, consultant_tag")
      .order("full_name", { ascending: true })
    setLinhas((data as PerfilLinha[]) ?? [])
    setCarregando(false)
  }, [supabase])

  useEffect(() => {
    carregar()
  }, [carregar])

  const mostrar = (r: ActionResult) => {
    setFeedback({ ok: r.ok, msg: r.message, cred: r.credenciais })
  }

  const convidar = async (e: React.FormEvent) => {
    e.preventDefault()
    setOcupado("convite")
    const r = await inviteUser({ fullName: nome, email, role: papel, consultantTag: tag })
    mostrar(r)
    if (r.ok) {
      setNome("")
      setEmail("")
      setTag("")
      setPapel("consultor_b2b")
      await carregar()
    }
    setOcupado(null)
  }

  const acao = async (chave: string, fn: () => Promise<ActionResult>, recarregar = true) => {
    setOcupado(chave)
    const r = await fn()
    mostrar(r)
    if (r.ok && recarregar) await carregar()
    setOcupado(null)
  }

  const rodarDiag = async () => {
    setDiagLoading(true)
    const r = await runDiagnostics()
    if (r.ok) setDiag(r.items)
    else setFeedback({ ok: false, msg: r.message })
    setDiagLoading(false)
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Usuários e acessos</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Convide, defina papéis e controle o acesso da equipe. As permissões são validadas no servidor.
          </p>
        </div>
        <span className="rounded-full bg-[#b4fcf1]/40 px-2 py-0.5 font-mono text-[10px] uppercase text-[#00302b]">
          {rotuloRole(perfil.role)}
        </span>
      </div>

      {feedback && (
        <div
          role="status"
          className={`mt-3 rounded-md px-3 py-2 text-xs ${
            feedback.ok ? "bg-[#b4fcf1]/40 text-[#00302b]" : "bg-rose-50 text-[#ff1a00]"
          }`}
        >
          <p>{feedback.msg}</p>
          {feedback.cred && (
            <div className="mt-2 space-y-1.5">
              <CampoCopiavel rotulo="Login" valor={feedback.cred.loginUrl} />
              <CampoCopiavel rotulo="E-mail" valor={feedback.cred.email} />
              <CampoCopiavel rotulo="Senha" valor={feedback.cred.senha} />
              <p className="text-[10px] text-[#00302b]/70">
                A senha some ao fechar. Copie agora e repasse ao usuário por um canal seguro.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Convite */}
      <form onSubmit={convidar} className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <label className="flex flex-col gap-1 lg:col-span-1">
          <span className="text-[11px] font-medium text-slate-600">Nome completo</span>
          <input className={input} value={nome} onChange={(e) => setNome(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1 lg:col-span-1">
          <span className="text-[11px] font-medium text-slate-600">E-mail</span>
          <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-slate-600">Papel</span>
          <select className={input} value={papel} onChange={(e) => setPapel(e.target.value as Role)}>
            <option value="consultor_b2b">{rotuloRole("consultor_b2b")}</option>
            <option value="high_school">{rotuloRole("high_school")}</option>
            <option value="supervisor">{rotuloRole("supervisor")}</option>
            {ehGerente && <option value="gerente">{rotuloRole("gerente")}</option>}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-slate-600">Tag (opcional)</span>
          <input className={`${input} font-mono text-xs`} value={tag} onChange={(e) => setTag(e.target.value)} placeholder="auto" />
        </label>
        <button type="submit" className={btn} disabled={ocupado === "convite"}>
          {ocupado === "convite" ? "Enviando…" : "Convidar usuário"}
        </button>
      </form>

      {/* Roster */}
      <div className="mt-4 overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 text-left font-semibold">Nome</th>
              <th className="px-3 py-2 text-left font-semibold">Papel</th>
              <th className="px-3 py-2 text-left font-semibold">Status</th>
              <th className="px-3 py-2 text-right font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {carregando && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-xs text-slate-400">Carregando…</td>
              </tr>
            )}
            {!carregando &&
              linhas.map((u) => {
                const busy = ocupado === u.id
                return (
                  <tr key={u.id}>
                    <td className="px-3 py-2">
                      <div className="text-slate-900">{u.full_name}</div>
                      <div className="font-mono text-[11px] text-slate-400">{u.email}</div>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className={`${input} py-1`}
                        value={normalizeRole(u.role)}
                        disabled={busy || (u.id === perfil.id)}
                        onChange={(e) => acao(u.id, () => changeRole(u.id, e.target.value as Role))}
                      >
                        <option value="consultor_b2b">{rotuloRole("consultor_b2b")}</option>
                        <option value="high_school">{rotuloRole("high_school")}</option>
                        <option value="supervisor">{rotuloRole("supervisor")}</option>
                        {ehGerente && <option value="gerente">{rotuloRole("gerente")}</option>}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] ${
                          u.active ? "bg-[#b4fcf1]/50 text-[#00302b]" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {u.active ? "Ativo" : "Desativado"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button className={btnNeutro} disabled={busy}
                          onClick={() => acao(u.id, () => setActive(u.id, !u.active))}>
                          {u.active ? "Desativar" : "Ativar"}
                        </button>
                        <button className={btnNeutro} disabled={busy || !u.email}
                          onClick={() => acao(u.id, () => resendInvite(u.email as string), false)}>
                          Reenviar convite
                        </button>
                        <button className={btnNeutro} disabled={busy || !u.email}
                          onClick={() => acao(u.id, () => resetPassword(u.email as string), false)}>
                          Redefinir senha
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            {!carregando && linhas.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-xs text-slate-400">Nenhum usuário.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Diagnóstico — somente gerência */}
      {ehGerente && (
        <div className="mt-4 rounded-md border border-dashed border-slate-300 p-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-semibold text-slate-800">Diagnóstico de contas</h4>
              <p className="text-[11px] text-slate-500">Identifica contas inconsistentes ou de teste.</p>
            </div>
            <button className={btnNeutro} onClick={rodarDiag} disabled={diagLoading}>
              {diagLoading ? "Verificando…" : "Executar diagnóstico"}
            </button>
          </div>
          {diag && (
            <ul className="mt-3 space-y-1.5">
              {diag.length === 0 && <li className="text-[11px] text-[#00302b]">Nenhuma inconsistência encontrada.</li>}
              {diag.map((d, i) => (
                <li key={i} className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px]">
                  <span className="text-slate-700">
                    <span className="font-mono text-slate-400">[{d.kind}]</span> {d.detail}
                    {d.email && <span className="text-slate-500"> · {d.email}</span>}
                  </span>
                  {d.fixable && d.userId && (
                    <button className={btnNeutro} disabled={ocupado === d.userId}
                      onClick={() => acao(d.userId as string, async () => {
                        const r = await fixMissingProfile(d.userId as string)
                        if (r.ok) await rodarDiag()
                        return r
                      })}>
                      Corrigir
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
