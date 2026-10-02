"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { ExternalLink, Globe, Loader2, MapPin, Plus, Trash2, X } from "lucide-react"
import { loadCompanyActions, saveCompanyAction } from "@/app/actions/company-actions"
import {
  ACTION_TIME_ZONE, companyHistory, httpLink, localActionDateTime,
  type CompanyActionInput, type CompanyActionRow, type HistoryFilter,
} from "@/lib/company-actions/domain"
import type { Atividade } from "@/lib/domain/types"
import { brDataLonga, num } from "@/lib/domain/utils"

type PanelData = Extract<Awaited<ReturnType<typeof loadCompanyActions>>, { ok: true }>
const field = "w-full min-w-0 max-w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-100 disabled:bg-slate-50"
const primary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
const secondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: ACTION_TIME_ZONE, dateStyle: "short", timeStyle: "short" })
const filters: { value: HistoryFilter; label: string }[] = [
  { value: "all", label: "Todas" }, { value: "presencial", label: "Presenciais" }, { value: "online", label: "Online" },
]

function ActionForm({ companyName, draft, consultants, busy, error, onChange, onClose, onSubmit }: {
  companyName: string
  draft: CompanyActionInput
  consultants: PanelData["consultants"]
  busy: boolean
  error: string
  onChange: (value: CompanyActionInput) => void
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  const change = (key: keyof CompanyActionInput, value: string) => onChange({ ...draft, [key]: value })
  return (
    <dialog ref={dialog} aria-labelledby="company-action-title" aria-describedby="company-action-help"
      onCancel={event => { event.preventDefault(); if (!busy) onClose() }}
      onKeyDown={event => { if (event.key === "Escape") event.stopPropagation() }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto rounded-xl border-0 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/60">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h3 id="company-action-title" className="text-base font-semibold">Registrar ação</h3>
          <p className="mt-1 break-words text-xs text-slate-500">{companyName}</p>
        </div>
        <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-50" onClick={onClose} disabled={busy} aria-label="Fechar formulário de ação"><X size={18} /></button>
      </div>
      <form onSubmit={onSubmit} className="space-y-4 px-4 py-4 sm:px-5">
        <p id="company-action-help" className="text-xs text-slate-500">Registre a ação realizada. Você pode alterar a data para incluir ações anteriores. Horário de Brasília.</p>
        <fieldset disabled={busy} className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Tipo de ação</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["presencial", "online"] as const).map(type => (
                <label key={type} className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${draft.actionType === type ? "border-teal-600 bg-teal-50 text-teal-900" : "border-slate-300"}`}>
                  <input type="radio" name="actionType" value={type} checked={draft.actionType === type} onChange={() => onChange({ ...draft, actionType: type })} className="accent-teal-700" />
                  {type === "presencial" ? <MapPin size={16} aria-hidden /> : <Globe size={16} aria-hidden />}
                  {type === "presencial" ? "Ação presencial" : "Divulgação online"}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block space-y-1 text-sm font-medium">Título da ação <span className="text-rose-600">*</span>
            <input autoFocus required maxLength={160} className={field} value={draft.title} onChange={e => change("title", e.target.value)} placeholder="Ex.: Apresentação de bolsas aos colaboradores" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-sm font-medium">Data <span className="text-rose-600">*</span>
              <input type="date" required className={field} value={draft.date} onChange={e => change("date", e.target.value)} />
            </label>
            <label className="block space-y-1 text-sm font-medium">Horário <span className="text-rose-600">*</span>
              <input type="time" required className={field} value={draft.time} onChange={e => change("time", e.target.value)} />
            </label>
          </div>
          <label className="block space-y-1 text-sm font-medium">Consultor responsável <span className="text-rose-600">*</span>
            <select required className={field} value={draft.responsibleUserId} onChange={e => change("responsibleUserId", e.target.value)}>
              {consultants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          {draft.actionType === "presencial" ? (
            <label className="block space-y-1 text-sm font-medium">Local da ação <span className="text-rose-600">*</span>
              <input required maxLength={500} className={field} value={draft.location} onChange={e => change("location", e.target.value)} placeholder="Ex.: Sede da empresa, sala de treinamento" />
            </label>
          ) : (
            <>
              <label className="block space-y-1 text-sm font-medium">Canal utilizado <span className="text-rose-600">*</span>
                <input required maxLength={100} list="company-action-channels" className={field} value={draft.channel} onChange={e => change("channel", e.target.value)} placeholder="WhatsApp, e-mail, redes sociais ou outro canal" />
                <datalist id="company-action-channels"><option value="WhatsApp" /><option value="E-mail" /><option value="Redes sociais" /><option value="Instagram" /><option value="LinkedIn" /></datalist>
              </label>
              <label className="block space-y-1 text-sm font-medium">Link da divulgação <span className="font-normal text-slate-500">(opcional)</span>
                <input type="url" maxLength={2048} className={field} value={draft.promotionUrl} onChange={e => change("promotionUrl", e.target.value)} placeholder="https://..." />
              </label>
            </>
          )}
          <label className="block space-y-1 text-sm font-medium">Descrição da ação <span className="text-rose-600">*</span>
            <textarea required rows={3} maxLength={5000} className={field} value={draft.description} onChange={e => change("description", e.target.value)} />
          </label>
          <label className="block space-y-1 text-sm font-medium">Resultado <span className="font-normal text-slate-500">(opcional)</span>
            <textarea rows={2} maxLength={2000} className={field} value={draft.result} onChange={e => change("result", e.target.value)} />
          </label>
          <label className="block space-y-1 text-sm font-medium">Observações <span className="font-normal text-slate-500">(opcional)</span>
            <textarea rows={2} maxLength={5000} className={field} value={draft.notes} onChange={e => change("notes", e.target.value)} />
          </label>
        </fieldset>
        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white py-3">
          <button type="button" className={secondary} disabled={busy} onClick={onClose}>Cancelar</button>
          <button type="submit" className={primary} disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}{busy ? "Salvando…" : "Salvar ação"}</button>
        </div>
      </form>
    </dialog>
  )
}

function ActionCard({ action }: { action: CompanyActionRow }) {
  const presencial = action.action_type === "presencial"
  const url = httpLink(action.promotion_url)
  return (
    <article className={`min-w-0 space-y-2 rounded-lg border border-l-4 p-3 ${presencial ? "border-teal-200 bg-teal-50/40" : "border-sky-200 bg-sky-50/40"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold ${presencial ? "bg-teal-100 text-teal-900" : "bg-sky-100 text-sky-900"}`}>
          {presencial ? <MapPin size={13} aria-hidden /> : <Globe size={13} aria-hidden />}{presencial ? "Ação presencial" : "Divulgação online"}
        </span>
        <time dateTime={action.occurred_at} className="text-xs tabular-nums text-slate-600">{dateFormatter.format(new Date(action.occurred_at))}</time>
      </div>
      <h4 className="break-words text-sm font-semibold text-slate-900">{action.title}</h4>
      <p className="break-words text-xs text-slate-600">Consultor responsável: <span className="font-medium">{action.responsible_name}</span></p>
      {action.commercial_cycle && <p className="text-xs text-slate-500">Ciclo {action.commercial_cycle.code} · {action.commercial_cycle.name}</p>}
      {action.location && <p className="break-words text-xs text-slate-600"><span className="font-medium">Local:</span> {action.location}</p>}
      {action.channel && <p className="break-words text-xs text-slate-600"><span className="font-medium">Canal:</span> {action.channel}</p>}
      <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{action.description}</p>
      {action.result && <p className="whitespace-pre-wrap break-words text-xs text-slate-700"><span className="font-semibold">Resultado:</span> {action.result}</p>}
      {action.notes && <p className="whitespace-pre-wrap break-words text-xs text-slate-700"><span className="font-semibold">Observações:</span> {action.notes}</p>}
      {url && <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 break-all text-xs font-medium text-sky-800 underline"><ExternalLink size={13} className="shrink-0" />Abrir divulgação</a>}
      <p className="break-words text-[11px] text-slate-500">Registrado por {action.creator_name} em {dateFormatter.format(new Date(action.created_at))}</p>
    </article>
  )
}

function LegacyCard({ activity: a, canDelete, onDelete }: { activity: Atividade; canDelete: boolean; onDelete: (id: string) => void }) {
  return (
    <article className="min-w-0 border-l-2 border-slate-200 pl-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-xs font-semibold text-slate-900">{brDataLonga(a.data)}{a.commercialCycle ? ` · Ciclo ${a.commercialCycle.code}` : ""}</span>
        <span className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">{a.tipo}</span>
        <span className="text-[11px] text-slate-500">{a.resultado}</span>
        <span className="ml-auto flex items-center gap-2 text-[11px] text-slate-500">{a.consultor}
          {canDelete && <button type="button" onClick={() => onDelete(a.id)} className="flex h-8 w-8 items-center justify-center rounded text-slate-500 hover:bg-rose-50 hover:text-rose-700" aria-label="Excluir registro de contato"><Trash2 size={14} /></button>}
        </span>
      </div>
      {a.etapaAnterior && a.etapaNova && a.etapaAnterior !== a.etapaNova && <p className="mt-0.5 text-[11px] text-teal-700">{a.etapaAnterior} → {a.etapaNova}</p>}
      {a.contato && <p className="text-[11px] text-slate-500">com {a.contato}</p>}
      <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-slate-700">{a.observacao}</p>
      {(num(a.leads) > 0 || num(a.impactados) > 0) && <p className="mt-0.5 text-[11px] text-teal-800">{num(a.leads) > 0 && `${a.leads} leads`}{num(a.leads) > 0 && num(a.impactados) > 0 && " · "}{num(a.impactados) > 0 && `${a.impactados} impactados`}</p>}
      {a.proximaAcao && <p className="mt-0.5 break-words text-[11px] text-slate-500">Próximo passo combinado: {a.proximaAcao}{a.dataProximoContato && ` · ${brDataLonga(a.dataProximoContato)}`}</p>}
    </article>
  )
}

export function CompanyActions({ companyId, companyName, legacyHistory, enabled, canManage, userName, onDeleteLegacy }: {
  companyId: string
  companyName: string
  legacyHistory: Atividade[]
  enabled: boolean
  canManage: boolean
  userName: string
  onDeleteLegacy: (id: string) => void
}) {
  const [data, setData] = useState<PanelData | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [loadError, setLoadError] = useState("")
  const [notice, setNotice] = useState("")
  const [filter, setFilter] = useState<HistoryFilter>("all")
  const [draft, setDraft] = useState<CompanyActionInput | null>(null)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState("")
  // Protect against a rapid double submit before React renders disabled buttons.
  const saving = useRef(false)
  const registerButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!enabled) return
    let active = true
    loadCompanyActions(companyId).then(result => {
      if (!active) return
      if (result.ok) setData(result)
      else setLoadError(result.message)
      setLoading(false)
    }).catch(() => {
      if (active) { setLoadError("Não foi possível carregar as ações. Tente novamente."); setLoading(false) }
    })
    return () => { active = false }
  }, [companyId, enabled])
  async function retry() {
    setLoading(true); setLoadError("")
    try {
      const result = await loadCompanyActions(companyId)
      if (result.ok) setData(result)
      else setLoadError(result.message)
    } catch { setLoadError("Não foi possível carregar as ações. Tente novamente.") }
    finally { setLoading(false) }
  }
  function open() {
    if (!data?.canRegister) return
    setSaveError(""); setNotice("")
    setDraft({ id: crypto.randomUUID(), companyId, actionType: "presencial", title: "", ...localActionDateTime(), responsibleUserId: data.actor.id,
      description: "", result: "", notes: "", location: "", channel: "", promotionUrl: "" })
  }
  function close() { if (!saving.current) { setDraft(null); registerButton.current?.focus() } }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft || saving.current) return
    saving.current = true; setBusy(true); setSaveError("")
    try {
      const result = await saveCompanyAction(draft)
      if (result.ok) {
        setData(current => current ? { ...current, actions: [result.action, ...current.actions.filter(a => a.id !== result.action.id)] } : current)
        setFilter("all"); setDraft(null); setNotice(result.message); registerButton.current?.focus()
      } else setSaveError(result.message)
    } catch { setSaveError("A conexão não respondeu. Seus dados foram mantidos; tente salvar novamente.") }
    finally { saving.current = false; setBusy(false) }
  }
  const entries = companyHistory(data?.actions || [], legacyHistory, filter)
  return (
    <section className="min-w-0 space-y-3" aria-label="Histórico da empresa">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2"><h3 className="text-sm font-semibold text-slate-900">Histórico</h3><span className="text-[11px] text-slate-500">{entries.length} registro{entries.length === 1 ? "" : "s"}</span></div>
        {enabled && <button ref={registerButton} type="button" className={primary} disabled={loading || !data?.canRegister} onClick={open}><Plus size={16} />Registrar ação</button>}
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar histórico por tipo de ação">
        {filters.map(f => <button key={f.value} type="button" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)} className={`min-h-10 rounded-lg border px-3 py-2 text-xs font-medium ${filter === f.value ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}>{f.label}</button>)}
      </div>
      {notice && <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">{notice}</p>}
      {loading && <p role="status" className="flex items-center gap-2 text-xs text-slate-500"><Loader2 size={14} className="animate-spin" />Carregando ações…</p>}
      {loadError && <div role="alert" className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><p>{loadError}</p><button type="button" className={secondary} onClick={() => void retry()}>Tentar novamente</button></div>}
      {!loading && data && !data.canRegister && <p className="text-xs text-slate-500">O registro de ações está disponível para o responsável pela carteira e para a gerência.</p>}
      {entries.length ? <ol className="space-y-3">{entries.map(entry => <li key={`${entry.kind}-${entry.id}`}>{entry.kind === "action"
        ? <ActionCard action={entry.action} />
        : <LegacyCard activity={entry.activity} canDelete={canManage || entry.activity.consultor === userName} onDelete={onDeleteLegacy} />}</li>)}</ol>
        : !loading && !loadError && <p className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-xs text-slate-500">{filter === "all" ? "Nenhum registro ainda. Contatos e ações realizadas aparecerão aqui." : "Nenhuma ação deste tipo registrada."}</p>}
      {draft && data && <ActionForm companyName={companyName} draft={draft} consultants={data.consultants} busy={busy} error={saveError} onChange={setDraft} onClose={close} onSubmit={submit} />}
    </section>
  )
}
