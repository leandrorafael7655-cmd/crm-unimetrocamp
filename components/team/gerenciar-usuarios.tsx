"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import type { Usuario } from "@/lib/domain/types"
import { type Role, rotuloRole } from "@/lib/domain/roles"
import {
  changeRole,
  setActive,
  runDiagnostics,
  fixMissingProfile,
  type ActionResult,
  type Diagnostic,
} from "@/app/actions/team"
import {
  addUser,
  deleteUser,
  listManagedUsers,
  sendPasswordRecovery,
  type ManagedUser,
  type UserAdminResult,
} from "@/app/actions/user-admin"
import { setAttendanceMember } from "@/app/actions/attendance"

const input =
  "rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-[#88005b] focus:ring-2 focus:ring-[#88005b]/20"
const btn =
  "rounded-md bg-[#88005b] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#6d0049] disabled:opacity-60"
const btnNeutro =
  "rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
const btnDanger =
  "rounded-md border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"

type Result = Pick<ActionResult, "ok" | "message"> | UserAdminResult

export function GerenciarUsuarios({ perfil }: { perfil: Usuario }) {
  const ehAdministrador = perfil.role === "gerente"

  const [linhas, setLinhas] = useState<ManagedUser[]>([])
  const [carregando, setCarregando] = useState(true)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const [nome, setNome] = useState("")
  const [email, setEmail] = useState("")
  const [papel, setPapel] = useState<Role>("consultor_b2b")
  const [tag, setTag] = useState("")
  const [incluirAtendimento, setIncluirAtendimento] = useState(true)

  const [diag, setDiag] = useState<Diagnostic[] | null>(null)
  const [diagLoading, setDiagLoading] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const r = await listManagedUsers()
    if (r.ok) setLinhas(r.users)
    else setFeedback({ ok: false, msg: r.message })
    setCarregando(false)
  }, [])

  useEffect(() => { void carregar() }, [carregar])

  const mostrar = (r: Result) => setFeedback({ ok: r.ok, msg: r.message })

  const adicionar = async (e: React.FormEvent) => {
    e.preventDefault()
    setOcupado("adicionar")
    const r = await addUser({ fullName: nome, email, role: papel, consultantTag: tag, includeInAttendance: incluirAtendimento })
    mostrar(r)
    if (r.ok) {
      setNome("")
      setEmail("")
      setTag("")
      setPapel("consultor_b2b")
      setIncluirAtendimento(true)
      await carregar()
    }
    setOcupado(null)
  }

  const acao = async (chave: string, fn: () => Promise<Result>, recarregar = true) => {
    setOcupado(chave)
    const r = await fn()
    mostrar(r)
    if (r.ok && recarregar) await carregar()
    setOcupado(null)
  }

  const excluir = async (u: ManagedUser) => {
    const confirmou = window.confirm(
      `Excluir definitivamente o acesso de ${u.full_name} (${u.email})?\n\n` +
      "• O usuário perderá o login no UniConecta.\n" +
      "• Ele será retirado do Atendimento e das atribuições futuras.\n" +
      "• Convites futuros vinculados a ele serão cancelados.\n" +
      "• O histórico de empresas, escolas, metas, rotas e ações será preservado.\n\n" +
      "Para a pessoa voltar depois, será necessário cadastrá-la novamente.",
    )
    if (!confirmou) return
    await acao(u.id, () => deleteUser(u.id))
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Gestão de usuários</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Cadastre acessos, defina perfis, recupere senhas e escolha quem participa da agenda de Atendimento.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/auth/reset-password" className={btnNeutro}>Alterar minha senha</Link>
          <span className="rounded-full bg-[#b4fcf1]/40 px-2 py-0.5 font-mono text-[10px] uppercase text-[#00302b]">{rotuloRole(perfil.role)}</span>
        </div>
      </div>

      {feedback && (
        <div role="status" className={`mt-3 rounded-md px-3 py-2 text-xs ${feedback.ok ? "bg-[#b4fcf1]/40 text-[#00302b]" : "bg-rose-50 text-[#ff1a00]"}`}>
          {feedback.msg}
        </div>
      )}

      {ehAdministrador ? (
        <form onSubmit={adicionar} className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-slate-600">Nome completo</span>
            <input className={input} value={nome} onChange={(e) => setNome(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-slate-600">E-mail</span>
            <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-slate-600">Perfil de acesso</span>
            <select className={input} value={papel} onChange={(e) => setPapel(e.target.value as Role)}>
              <option value="consultor_b2b">{rotuloRole("consultor_b2b")}</option>
              <option value="high_school">{rotuloRole("high_school")}</option>
              <option value="supervisor">{rotuloRole("supervisor")}</option>
              <option value="gerente">{rotuloRole("gerente")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-slate-600">Tag (opcional)</span>
            <input className={`${input} font-mono text-xs`} value={tag} onChange={(e) => setTag(e.target.value)} placeholder="automática" />
          </label>
          <label className="flex min-h-9 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700">
            <input type="checkbox" checked={incluirAtendimento} onChange={(e) => setIncluirAtendimento(e.target.checked)} className="h-4 w-4 accent-[#88005b]" />
            Incluir no Atendimento
          </label>
          <button type="submit" className={btn} disabled={ocupado === "adicionar"}>{ocupado === "adicionar" ? "Adicionando…" : "Adicionar usuário"}</button>
        </form>
      ) : (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Somente o perfil Gerente pode adicionar ou excluir usuários. A supervisão pode administrar papel, status, recuperação e participação no Atendimento.
        </div>
      )}

      <p className="mt-2 text-[11px] text-slate-500">
        O e-mail cadastrado no usuário é o e-mail usado para convites de Atendimento, ações de empresas e ações de escolas. Marcar “Incluir no Atendimento” apenas o habilita para a escala — não cria compromissos automaticamente.
      </p>

      <div className="mt-4 overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 text-left font-semibold">Nome</th>
              <th className="px-3 py-2 text-left font-semibold">Papel</th>
              <th className="px-3 py-2 text-left font-semibold">Atendimento</th>
              <th className="px-3 py-2 text-left font-semibold">Status</th>
              <th className="px-3 py-2 text-right font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {carregando && <tr><td colSpan={5} className="px-3 py-4 text-center text-xs text-slate-400">Carregando…</td></tr>}
            {!carregando && linhas.map((u) => {
              const busy = ocupado === u.id
              const status = !u.active ? "Desativado" : u.email_confirmed ? "Ativo" : "Pendente"
              return (
                <tr key={u.id}>
                  <td className="px-3 py-2">
                    <div className="text-slate-900">{u.full_name}</div>
                    <div className="font-mono text-[11px] text-slate-400">{u.email}</div>
                  </td>
                  <td className="px-3 py-2">
                    <select className={`${input} py-1`} value={u.role} disabled={busy || u.id === perfil.id} onChange={(e) => acao(u.id, () => changeRole(u.id, e.target.value as Role))}>
                      <option value="consultor_b2b">{rotuloRole("consultor_b2b")}</option>
                      <option value="high_school">{rotuloRole("high_school")}</option>
                      <option value="supervisor">{rotuloRole("supervisor")}</option>
                      {ehAdministrador && <option value="gerente">{rotuloRole("gerente")}</option>}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={u.attendance_enabled}
                        disabled={busy || !u.active}
                        onChange={(e) => acao(u.id, () => setAttendanceMember(u.id, e.target.checked))}
                        className="h-4 w-4 accent-[#88005b]"
                      />
                      {u.attendance_enabled ? "Na agenda" : "Fora da agenda"}
                    </label>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${status === "Ativo" ? "bg-[#b4fcf1]/50 text-[#00302b]" : status === "Pendente" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{status}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <button type="button" className={btnNeutro} disabled={busy || u.id === perfil.id} onClick={() => acao(u.id, () => setActive(u.id, !u.active))}>{u.active ? "Desativar" : "Ativar"}</button>
                      <button type="button" className={btnNeutro} disabled={busy || !u.email} onClick={() => acao(u.id, () => sendPasswordRecovery(u.email), false)}>Enviar recuperação</button>
                      {ehAdministrador && u.id !== perfil.id && <button type="button" className={btnDanger} disabled={busy} onClick={() => excluir(u)}>Excluir</button>}
                    </div>
                  </td>
                </tr>
              )
            })}
            {!carregando && linhas.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-xs text-slate-400">Nenhum usuário cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>

      {ehAdministrador && (
        <div className="mt-4 rounded-md border border-dashed border-slate-300 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-semibold text-slate-800">Diagnóstico de contas</h4>
              <p className="text-[11px] text-slate-500">Identifica contas inconsistentes ou de teste.</p>
            </div>
            <button type="button" className={btnNeutro} onClick={rodarDiag} disabled={diagLoading}>{diagLoading ? "Verificando…" : "Executar diagnóstico"}</button>
          </div>
          {diag && (
            <ul className="mt-3 space-y-1.5">
              {diag.length === 0 && <li className="text-[11px] text-[#00302b]">Nenhuma inconsistência encontrada.</li>}
              {diag.map((d, i) => (
                <li key={`${d.kind}-${d.userId ?? i}`} className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px]">
                  <span className="text-slate-700"><span className="font-mono text-slate-400">[{d.kind}]</span> {d.detail}{d.email && <span className="text-slate-500"> · {d.email}</span>}</span>
                  {d.fixable && d.userId && (
                    <button type="button" className={btnNeutro} disabled={ocupado === d.userId} onClick={() => acao(d.userId as string, async () => {
                      const r = await fixMissingProfile(d.userId as string)
                      if (r.ok) await rodarDiag()
                      return r
                    })}>Corrigir</button>
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
