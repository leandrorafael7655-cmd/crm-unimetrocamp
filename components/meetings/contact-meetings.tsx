"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { validEmail } from "@/lib/meetings/domain"
import { loadContactMeetings, saveContactMeeting, cancelContactMeeting, retryContactMeeting } from "@/app/actions/contact-meetings"
import { contactMeetingTitle, deliveryLabel, latestDelivery, summarizeMeetingDeliveries, type ContactMeeting, type ContactMeetingEntity, type ContactMeetingInput } from "@/lib/meetings/contact-domain"

const field = "min-h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
const control = "inline-flex min-h-10 items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
const button = `${control} border-slate-300 bg-white`
const primary = `${control} border-[#88005b] bg-[#88005b] text-white`
type Data = Extract<Awaited<ReturnType<typeof loadContactMeetings>>, { ok: true }>
function local(iso: string) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso))
}

export function ContactMeetings({ entity, entityId, onChanged }: {
  entity: ContactMeetingEntity; entityId: string; onChanged?: () => Promise<void>
}) {
  const router = useRouter()
  const [data, setData] = useState<Data | null>(null)
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<ContactMeetingInput | null>(null)
  const [cancel, setCancel] = useState<ContactMeeting | null>(null)
  const reload = useCallback(async () => {
    try {
      const result = await loadContactMeetings(entity, entityId)
      if (result.ok) setData(result)
      else setNotice(result.message)
    } catch { setNotice("Não foi possível atualizar as reuniões. Tente novamente.") }
  }, [entity, entityId])
  useEffect(() => {
    let active = true
    loadContactMeetings(entity, entityId).then(result => {
      if (!active) return
      if (result.ok) setData(result)
      else setNotice(result.message)
    }).catch(() => { if (active) setNotice("Não foi possível carregar as reuniões. Tente atualizar a ficha.") })
    return () => { active = false }
  }, [entity, entityId])
  async function run(action: () => Promise<{ ok: boolean; message: string }>) {
    setBusy(true)
    try {
      const result = await action()
      setNotice(result.message)
      if (result.ok) { setDraft(null); setCancel(null); await reload(); router.refresh(); await onChanged?.() }
    } catch { setNotice("Sem confirmação. Atualize o histórico antes de repetir; o identificador da reunião foi preservado.") }
    finally { setBusy(false) }
  }
  function create() {
    setDraft({ id: crypto.randomUUID(), entity, entityId, revision: 0, title: "", description: "", date: "", startTime: "", endTime: "",
      mode: "online", meetingUrl: "", location: "", contactIds: [] })
  }
  function edit(meeting: ContactMeeting) {
    const start = local(meeting.start_at), end = local(meeting.end_at)
    setDraft({ id: meeting.id, entity, entityId, revision: meeting.revision, title: meeting.subject,
      description: meeting.description, date: start.slice(0, 10), startTime: start.slice(11, 16), endTime: end.slice(11, 16),
      mode: meeting.mode, meetingUrl: meeting.meeting_url || "", location: meeting.location,
      contactIds: meeting.contact_meeting_recipients.flatMap(r => r.contact_id ? [r.contact_id] : []) })
  }
  const isEdit = draft ? !!data?.meetings.some(m => m.id === draft.id) : false
  const originalConsultant = draft && data?.meetings.find(m => m.id === draft.id)?.contact_meeting_recipients.find(r => r.kind === "consultant")
  function submit(event: FormEvent) { event.preventDefault(); if (draft) void run(() => saveContactMeeting(draft)) }
  return <section id="reunioes-convites" aria-label="Reuniões e convites" className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
    <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-slate-900">Reuniões e convites</h3>
        <p className="mt-1 text-xs text-slate-600">O consultor responsável sempre recebe. Você escolhe quais contatos desta ficha também serão convidados. Não é obrigatório selecionar um contato.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primary} disabled={busy || !data?.writable || data.archived || !data.actor.email} onClick={create}>Agendar reunião</button>
        {data && <button type="button" className={button} disabled={busy} onClick={() => void reload()}>Atualizar reuniões</button>}
      </div>
    </div>
    {notice && <p role="status" className="break-words rounded-lg bg-violet-50 p-3 text-sm text-violet-950">{notice}</p>}
    {!data && <button className={button} type="button" onClick={() => void reload()}>Atualizar reuniões</button>}
    {data && <>
      <p className="break-words text-xs text-slate-600">Consultor: {data.actor.name} · <span className="break-all">{data.actor.email || "Cadastre seu e-mail no perfil"}</span></p>
      {data.paused && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Envio de convites pausado. Agendamentos, remarcações e cancelamentos ficam registrados sem enviar e-mails.</p>}
      {draft && <form aria-label={isEdit ? "Remarcar reunião" : "Agendar reunião"} onSubmit={submit} className="space-y-4 rounded-lg border border-violet-200 p-3 sm:p-4">
        <h4 className="font-semibold">{isEdit ? "Remarcar reunião" : "Nova reunião"}</h4>
        <label className="block text-sm">Assunto<input required maxLength={180} className={field} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
        <p className="break-words text-xs text-slate-500">Título do convite: UniConecta | {draft.title || "[assunto]"} | {data.entityName}</p>
        <div className="grid min-w-0 gap-3 sm:grid-cols-3">
          <label className="min-w-0 text-sm">Data<input required type="date" className={field} value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></label>
          <label className="min-w-0 text-sm">Início<input required type="time" className={field} value={draft.startTime} onChange={e => setDraft({ ...draft, startTime: e.target.value })} /></label>
          <label className="min-w-0 text-sm">Término<input required type="time" className={field} value={draft.endTime} onChange={e => setDraft({ ...draft, endTime: e.target.value })} /></label>
        </div>
        <p className="text-xs text-slate-500">Horário de Brasília</p>
        <label className="block text-sm">Modalidade<select className={field} value={draft.mode} onChange={e => setDraft({ ...draft, mode: e.target.value as "online" | "presencial" })}><option value="online">Online</option><option value="presencial">Presencial</option></select></label>
        <label className="block text-sm">Link da reunião (Teams){draft.mode === "presencial" ? " · opcional" : ""}
          <input type="url" required={draft.mode === "online"} maxLength={2000} pattern="https://.*" placeholder="https://teams.microsoft.com/…" className={field} value={draft.meetingUrl} onChange={e => setDraft({ ...draft, meetingUrl: e.target.value })} />
        </label>
        <p className="text-xs text-slate-500">Crie o link no Teams e cole aqui. Ele será incluído no e-mail e no convite da agenda.</p>
        {draft.mode === "presencial" && <label className="block text-sm">Local<input required maxLength={300} className={field} value={draft.location} onChange={e => setDraft({ ...draft, location: e.target.value })} /></label>}
        <label className="block text-sm">Pauta<textarea maxLength={10000} rows={3} className={field} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
        <fieldset className="min-w-0 space-y-2 rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">Destinatários</legend>
          <p className="break-words text-xs">✓ {originalConsultant?.name || data.actor.name} · <span className="break-all">{originalConsultant?.email || data.actor.email}</span> (consultor, sempre convidado)</p>
          {isEdit && <p className="text-xs text-slate-500">Remarcação e cancelamento usam os destinatários e endereços originais. Para trocar a lista, cancele e crie outra reunião.</p>}
          {!data.contacts.length && <p className="text-xs text-slate-500">Nenhum contato cadastrado. Você pode agendar somente para o consultor.</p>}
          {data.contacts.map(contact => <label key={contact.id} className="flex min-h-10 items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 shrink-0" disabled={!validEmail(contact.email?.trim() || "") || isEdit} checked={draft.contactIds.includes(contact.id)}
              onChange={e => setDraft({ ...draft, contactIds: e.target.checked ? [...draft.contactIds, contact.id] : draft.contactIds.filter(id => id !== contact.id) })} />
            <span className="min-w-0 break-words">{contact.name}<span className="block break-all text-xs text-slate-500">{contact.email?.trim() ? validEmail(contact.email.trim()) ? contact.email : "E-mail inválido · não pode receber convite" : "Sem e-mail · não pode receber convite"}</span></span>
          </label>)}
          {isEdit && data.meetings.find(m => m.id === draft.id)?.contact_meeting_recipients.filter(r => r.kind === "contact").map(r =>
            <p key={r.id} className="break-all text-xs text-slate-500">Endereço preservado: {r.name} · {r.email}</p>)}
          <p className="text-xs text-slate-500">Se mais de um contato usar o mesmo e-mail, será enviada uma única mensagem por endereço.</p>
          <p className="break-words text-xs font-medium">Resumo: {originalConsultant?.name || data.actor.name}{draft.contactIds.length ? `; ${isEdit ? data.meetings.find(m => m.id === draft.id)?.contact_meeting_recipients.filter(r => r.kind === "contact").map(r => r.name).join("; ") : data.contacts.filter(c => draft.contactIds.includes(c.id)).map(c => c.name).join("; ")}` : " (somente o consultor)"}</p>
        </fieldset>
        <div className="flex flex-wrap gap-2"><button disabled={busy} className={primary}>{isEdit ? "Salvar remarcação" : "Salvar reunião"}</button><button disabled={busy} type="button" className={button} onClick={() => setDraft(null)}>Fechar formulário</button></div>
      </form>}
      {!data.meetings.length && <p className="text-sm text-slate-500">Nenhuma reunião com contatos agendada.</p>}
      <ul className="min-w-0 space-y-3">{data.meetings.map(meeting => <li key={meeting.id} data-contact-meeting-id={meeting.id} className="min-w-0 space-y-2 rounded-lg border border-slate-200 p-3">
        <h4 className="break-words font-semibold">{contactMeetingTitle(meeting)}</h4>
        <p className="text-xs text-slate-600">{local(meeting.start_at).split(" ").join(" · ")}–{local(meeting.end_at).slice(11, 16)} · {meeting.status === "cancelada" ? "Cancelada" : "Agendada"}</p>
        <p className="break-words text-xs text-slate-600">{meeting.mode === "online" ? "Online" : `Presencial · ${meeting.location}`}</p>
        {meeting.meeting_url && <a className="block break-all text-sm text-[#88005b] underline" href={meeting.meeting_url} target="_blank" rel="noreferrer">Entrar na reunião (Teams)</a>}
        {!meeting.delivery_enabled && <p className="text-xs text-amber-800">Envio desta reunião aguardando liberação.</p>}
        <p className="text-xs font-medium">{summarizeMeetingDeliveries(meeting.contact_meeting_jobs)?.label || "Envio pendente"}</p>
        <details><summary className="cursor-pointer text-sm font-medium">Histórico por destinatário</summary>
          <ul className="mt-2 space-y-3">{meeting.contact_meeting_recipients.map(recipient => {
            const latest = latestDelivery(meeting.contact_meeting_jobs, recipient.email)
            return <li className="min-w-0 break-words text-xs" key={recipient.id}>
              <p className="font-medium">{recipient.name} · {recipient.kind === "consultant" ? "Consultor" : "Contato"}</p>
              <p className="break-all">{recipient.email}</p><p>{deliveryLabel(latest)}</p>
              {latest?.last_error && <p className="text-rose-700">{latest.last_error}</p>}
              <ul className="mt-1 space-y-1 text-slate-500">{meeting.contact_meeting_jobs.filter(j => j.recipient_email === recipient.email).sort((a, b) => a.event_sequence - b.event_sequence).map(job =>
                <li key={job.id}>{job.operation} · sequência {job.event_sequence} · {deliveryLabel(job)} · {job.attempts || 0} tentativa(s){job.sent_at || job.updated_at || job.created_at ? ` · ${local((job.sent_at || job.updated_at || job.created_at)!)}` : ""}</li>)}</ul>
            </li>
          })}</ul>
          <p className="mt-2 break-all text-[11px] text-slate-500">UID: {meeting.event_uid} · sequência {meeting.revision - 1}. O aceite é acompanhado manualmente; o SMTP confirma o envio, não a resposta.</p>
        </details>
        {meeting.responsible_user_id === data.actor.id && data.writable && <div className="flex flex-wrap gap-2">
          {meeting.status !== "cancelada" && <><button type="button" className={button} disabled={busy || data.archived} onClick={() => edit(meeting)}>Remarcar</button><button type="button" className={button} disabled={busy} onClick={() => setCancel(meeting)}>Cancelar reunião</button></>}
          <button type="button" className={button} disabled={busy || data.paused || !meeting.delivery_enabled} onClick={() => void run(() => retryContactMeeting(entity, entityId, meeting.id))}>Tentar envio pendente</button>
        </div>}
      </li>)}</ul>
      {cancel && <div role="alertdialog" aria-label="Confirmar cancelamento" className="space-y-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm">
        <p>Cancelar “{cancel.subject}”? O cancelamento fica no histórico e será destinado às mesmas pessoas. A pausa de envio será respeitada.</p>
        <ul className="space-y-1">{cancel.contact_meeting_recipients.map(recipient => <li className="break-words text-xs" key={recipient.id}>{recipient.name} · <span className="break-all">{recipient.email}</span></li>)}</ul>
        <p className="text-xs">Uma mensagem por endereço, preservando os destinatários originais.</p>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} className={button} onClick={() => void run(() => cancelContactMeeting(entity, entityId, cancel.id, cancel.revision))}>Confirmar cancelamento</button><button type="button" disabled={busy} className={button} onClick={() => setCancel(null)}>Voltar</button></div>
      </div>}
    </>}
  </section>
}
