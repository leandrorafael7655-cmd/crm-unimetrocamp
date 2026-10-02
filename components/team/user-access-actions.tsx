"use client"

import { useState } from "react"
import { createTemporaryPassword, listUserAccessHistory, sendUserRecovery } from "@/app/actions/user-access"

const button = "rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"

export function UserAccessActions({ userId, name, disabled, self, feedback }: {
  userId: string; name: string; disabled: boolean; self: boolean;
  feedback: (result: { ok: boolean; message: string }) => void
}) {
  const [busy, setBusy] = useState(false)
  const [temporary, setTemporary] = useState<string | null>(null)
  const [copyMessage, setCopyMessage] = useState("")
  async function run(temporaryOperation: boolean) {
    if (temporaryOperation && !window.confirm(`Criar uma senha temporária para ${name}? A senha anterior deixará de funcionar e a troca será obrigatória no próximo acesso.`)) return
    setBusy(true)
    try {
      const result = temporaryOperation ? await createTemporaryPassword(userId) : await sendUserRecovery(userId)
      feedback(result)
      if (result.ok && result.temporaryPassword) { setTemporary(result.temporaryPassword); setCopyMessage("") }
    } catch { feedback({ ok: false, message: "Não foi possível concluir a operação. Tente novamente." }) }
    finally { setBusy(false) }
  }
  async function copy() {
    if (!temporary) return
    try { await navigator.clipboard.writeText(temporary); setCopyMessage("Senha copiada.") }
    catch { setCopyMessage("Não foi possível copiar. Selecione a senha e copie manualmente.") }
  }
  return <>
    <button type="button" className={button} disabled={disabled || busy} onClick={() => void run(false)}>Enviar recuperação</button>
    {!self && <button type="button" className={button} disabled={disabled || busy} onClick={() => void run(true)}>Criar senha temporária</button>}
    {temporary && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby={`temporary-title-${userId}`}>
      <div className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6 text-left shadow-xl">
        <h3 id={`temporary-title-${userId}`} className="text-lg font-semibold text-slate-900">Senha temporária criada</h3>
        <p className="text-sm text-slate-600">Colaborador: <strong>{name}</strong>. Esta senha aparece somente agora. O colaborador deverá alterá-la antes de acessar o CRM.</p>
        <output aria-label="Senha temporária" className="block select-all break-all rounded-lg bg-slate-100 p-3 font-mono text-lg text-slate-900">{temporary}</output>
        <p role="status" className="text-xs text-slate-600">{copyMessage}</p>
        <div className="flex justify-end gap-2">
          <button type="button" className={button} onClick={() => void copy()}>Copiar senha</button>
          <button type="button" className={button} onClick={() => { setTemporary(null); setCopyMessage("") }}>Fechar e ocultar senha</button>
        </div>
      </div>
    </div>}
  </>
}

type HistoryEntry = Awaited<ReturnType<typeof listUserAccessHistory>>["entries"][number]
const actionLabels: Record<string, string> = { recovery_email: "Recuperação por e-mail", temporary_password: "Senha temporária", password_changed: "Senha alterada pelo usuário" }
const statusLabels: Record<string, string> = { pending: "Pendente", succeeded: "Concluída", failed: "Falhou" }

export function UserAccessHistory() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  async function load() {
    setBusy(true); setError("")
    try {
      const result = await listUserAccessHistory()
      if (result.ok) setEntries(result.entries)
      else setError(result.message)
    } catch { setError("Não foi possível carregar o histórico.") }
    finally { setBusy(false) }
  }
  const person = (value: HistoryEntry["actor"]) => {
    const profile = Array.isArray(value) ? value[0] : value
    return profile?.full_name || profile?.email || "Usuário"
  }
  return <div className="mt-4 rounded-lg border border-slate-200 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="text-sm font-semibold text-slate-800">Histórico de redefinições de acesso</h4>
      <button type="button" className={button} disabled={busy} onClick={() => void load()}>{busy ? "Carregando…" : "Consultar histórico"}</button>
    </div>
    {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
    {entries && <div className="mt-3 overflow-x-auto">
      <table className="w-full text-left text-xs"><thead><tr className="text-slate-500"><th className="p-2">Data (São Paulo)</th><th className="p-2">Operação</th><th className="p-2">Realizada por</th><th className="p-2">Colaborador</th><th className="p-2">Resultado</th></tr></thead>
        <tbody>{entries.map(entry => <tr key={entry.id} className="border-t border-slate-100">
          <td className="p-2">{new Date(entry.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
          <td className="p-2">{actionLabels[entry.action]}</td><td className="p-2">{person(entry.actor)}</td><td className="p-2">{person(entry.target)}</td><td className="p-2">{statusLabels[entry.status]}</td>
        </tr>)}</tbody>
      </table>{entries.length === 0 && <p className="p-2 text-slate-500">Nenhuma redefinição registrada.</p>}
    </div>}
  </div>
}
