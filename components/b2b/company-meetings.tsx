"use client"

import { useCallback, useEffect, useState } from "react"
import { CalendarPlus, Check, Loader2, Pencil, Plus, RefreshCw, Trash2, Video, X } from "lucide-react"
import {
  cancelCompanyMeeting,
  loadCompanyMeetings,
  refreshCompanyMeeting,
  retryCompanyMeeting,
  saveCompanyContact,
  saveCompanyMeeting,
  setCompanyMeetingStatus,
} from "@/app/actions/b2b-meetings"
import {
  MEETING_STATUSES,
  type CompanyContact,
  type MeetingInput,
  type MeetingRow,
  type MeetingStatus,
} from "@/lib/meetings/types"

const field =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:bg-slate-50"
const primary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-violet-700 px-3 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
const secondary =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
type PanelData = Extract<Awaited<ReturnType<typeof loadCompanyMeetings>>, { ok: true }>
const emptyContact: Partial<CompanyContact> = {
  nome: "",
  cargo: "",
  email: "",
  telefone: "",
  observacoes: "",
  is_primary: false,
}
const localParts = (iso: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(iso))
    .replace(" ", "T")
const showDate = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso))
const responses: Record<string, string> = {
  accepted: "Aceitou",
  declined: "Recusou",
  tentativelyAccepted: "Talvez",
  notResponded: "Sem resposta",
  none: "Sem resposta",
}
function safeLink(value: string | null) {
  try {
    return value && new URL(value).protocol === "https:" ? value : undefined
  } catch {
    return undefined
  }
}

export function CompanyMeetings({
  companyId,
  companyName,
  onChanged,
}: {
  companyId: string
  companyName: string
  onChanged?: () => Promise<void>
}) {
  const [data, setData] = useState<PanelData | null>(null),
    [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true)
  const [snapshotAt, setSnapshotAt] = useState(() => Date.now())
  const [contact, setContact] = useState<Partial<CompanyContact> | null>(null)
  const [meeting, setMeeting] = useState<MeetingInput | null>(null),
    [cancelId, setCancelId] = useState<string | null>(null)
  const reload = useCallback(async () => {
    const result = await loadCompanyMeetings(companyId)
    if (result.ok) {
      setData(result)
      setSnapshotAt(Date.now())
    } else setNotice(result.message)
    setLoading(false)
  }, [companyId])
  useEffect(() => {
    let active = true
    loadCompanyMeetings(companyId)
      .then((result) => {
        if (!active) return
        if (result.ok) setData(result)
        else setNotice(result.message)
        setLoading(false)
        const status = new URLSearchParams(window.location.search).get("microsoft")
        if (status === "connected")
          setNotice("Conta Microsoft vinculada. Você já pode agendar suas reuniões.")
        if (status === "error")
          setNotice(
            "Não foi possível vincular a conta. Use o mesmo e-mail corporativo do perfil e confirme a autorização com a TI.",
          )
      })
      .catch(() => {
        if (active) {
          setNotice("Não foi possível carregar a ficha. Tente novamente.")
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [companyId])
  async function run(action: () => Promise<{ ok: boolean; message: string }>, done?: () => void) {
    setBusy(true)
    setNotice("")
    try {
      const result = await action()
      setNotice(result.message)
      if (result.ok) {
        done?.()
        await reload()
        await onChanged?.()
      }
    } catch {
      setNotice(
        "A operação não respondeu. Atualize a ficha antes de tentar novamente; o agendamento mantém o mesmo identificador.",
      )
    } finally {
      setBusy(false)
    }
  }
  function newMeeting() {
    if (!data) return
    const principal = data.contacts.find((c) => c.is_primary) || data.contacts[0]
    setMeeting({
      id: crypto.randomUUID(),
      companyId,
      contactId: principal?.id || "",
      revision: 0,
      date: "",
      startTime: "09:00",
      endTime: "10:00",
      title: "",
      description: "",
      meetingType: "teams",
      location: "",
      participants: [],
    })
  }
  function editMeeting(row: MeetingRow) {
    const start = localParts(row.start_at),
      end = localParts(row.end_at)
    setMeeting({
      id: row.id,
      companyId,
      contactId: row.contact_id,
      revision: row.revision,
      date: start.slice(0, 10),
      startTime: start.slice(11, 16),
      endTime: end.slice(11, 16),
      title: row.title,
      description: row.description || "",
      meetingType: row.meeting_type,
      location: row.location || "",
      participants: row.activity_participants.map((p) => ({ name: p.name, email: p.email })),
    })
  }
  const selected = data?.contacts.find((c) => c.id === meeting?.contactId)
  const oldMeeting = data?.meetings.find((m) => m.id === meeting?.id)
  return (
    <section
      className="my-4 space-y-4 border-b border-slate-200 pb-5"
      aria-label="Contatos e reuniões da empresa"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Responsáveis e reuniões</h3>
          <p className="mt-1 text-xs text-slate-500">
            Converse com a empresa e acompanhe os compromissos pelo Outlook.
          </p>
        </div>
        <button
          type="button"
          className={primary}
          onClick={newMeeting}
          disabled={busy || !data?.canEdit || !data?.microsoft.connected || !data.contacts.length}
        >
          <CalendarPlus size={16} />
          Agendar reunião
        </button>
      </div>
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950"
        >
          {notice}
        </p>
      )}
      {loading && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="animate-spin" size={16} />
          Carregando contatos e reuniões…
        </p>
      )}
      {!loading && !data && (
        <button type="button" className={secondary} onClick={() => void reload()}>
          Tentar carregar novamente
        </button>
      )}
      {data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs">
              <p className="font-semibold text-slate-800">Organizador: {data.organizer.name}</p>
              <p className="mt-1 break-all text-slate-600">
                {data.organizer.email || "E-mail corporativo não cadastrado"}
              </p>
              <p className="mt-1 text-slate-500">
                {data.microsoft.connected
                  ? `Microsoft 365 vinculada: ${data.microsoft.email}`
                  : data.microsoft.configured
                    ? "Vincule sua conta Microsoft uma vez para usar seu calendário."
                    : "O agendamento aguarda a configuração Microsoft 365 pela gerência."}
              </p>
            </div>
            {data.microsoft.configured && data.canEdit && (
              <a href="/api/microsoft/connect" className={secondary}>
                {data.microsoft.connected ? "Reconectar Microsoft 365" : "Vincular Microsoft 365"}
              </a>
            )}
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900">Responsável / Contato da Empresa</h4>
              {data.canEdit && (
                <button
                  type="button"
                  className={secondary}
                  disabled={busy}
                  onClick={() => setContact({ ...emptyContact, is_primary: data.contacts.length === 0 })}
                >
                  <Plus size={14} />
                  Adicionar contato
                </button>
              )}
            </div>
            {!data.contacts.length && (
              <p className="rounded-lg border border-dashed p-3 text-xs text-slate-500">
                Cadastre o responsável e seu e-mail para enviar convites de reunião.
              </p>
            )}
            <ul className="grid gap-2 sm:grid-cols-2">
              {data.contacts.map((c) => (
                <li key={c.id} className="rounded-lg border border-slate-200 p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-sm text-slate-900">{c.nome}</strong>
                    {data.canEdit && (
                      <button
                        type="button"
                        className="p-1 text-slate-600"
                        disabled={busy}
                        aria-label={`Editar contato ${c.nome}`}
                        onClick={() => setContact({ ...c })}
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                  </div>
                  {c.is_primary && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded bg-violet-50 px-2 py-1 text-violet-800">
                      <Check size={12} />
                      Responsável principal
                    </span>
                  )}
                  {c.cargo && <p className="mt-1 text-slate-600">{c.cargo}</p>}
                  <p className="mt-1 break-all text-slate-600">{c.email || "E-mail não cadastrado"}</p>
                  {c.telefone && <p className="mt-1 text-slate-600">{c.telefone}</p>}
                  {c.observacoes && (
                    <p className="mt-2 whitespace-pre-wrap text-slate-500">{c.observacoes}</p>
                  )}
                </li>
              ))}
            </ul>
            {contact && (
              <form
                className="mt-3 grid gap-3 rounded-xl border border-violet-200 bg-violet-50/40 p-4 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  void run(
                    () => saveCompanyContact(companyId, contact),
                    () => setContact(null),
                  )
                }}
              >
                <h4 className="font-semibold text-slate-900 sm:col-span-2">
                  {contact.id ? "Editar responsável" : "Novo responsável"}
                </h4>
                <label className="space-y-1 text-xs">
                  Nome do responsável
                  <input
                    required
                    maxLength={160}
                    className={field}
                    value={contact.nome || ""}
                    onChange={(e) => setContact({ ...contact, nome: e.target.value })}
                  />
                </label>
                <label className="space-y-1 text-xs">
                  Cargo
                  <input
                    maxLength={160}
                    className={field}
                    value={contact.cargo || ""}
                    onChange={(e) => setContact({ ...contact, cargo: e.target.value })}
                  />
                </label>
                <label className="space-y-1 text-xs">
                  E-mail
                  <input
                    type="email"
                    maxLength={254}
                    className={field}
                    value={contact.email || ""}
                    onChange={(e) => setContact({ ...contact, email: e.target.value })}
                  />
                </label>
                <label className="space-y-1 text-xs">
                  Telefone / WhatsApp
                  <input
                    type="tel"
                    maxLength={50}
                    className={field}
                    value={contact.telefone || ""}
                    onChange={(e) => setContact({ ...contact, telefone: e.target.value })}
                  />
                </label>
                <label className="space-y-1 text-xs sm:col-span-2">
                  Observações
                  <textarea
                    maxLength={5000}
                    rows={2}
                    className={field}
                    value={contact.observacoes || ""}
                    onChange={(e) => setContact({ ...contact, observacoes: e.target.value })}
                  />
                </label>
                <label className="flex items-center gap-2 text-xs sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={!!contact.is_primary}
                    onChange={(e) => setContact({ ...contact, is_primary: e.target.checked })}
                  />
                  Responsável principal
                </label>
                <div className="flex justify-end gap-2 sm:col-span-2">
                  <button
                    type="button"
                    disabled={busy}
                    className={secondary}
                    onClick={() => setContact(null)}
                  >
                    Fechar
                  </button>
                  <button disabled={busy} className={primary}>
                    Salvar contato
                  </button>
                </div>
              </form>
            )}
          </div>
          {meeting && (
            <form
              aria-label="Agendar reunião"
              className="grid gap-3 rounded-xl border border-violet-300 bg-violet-50/30 p-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault()
                void run(
                  () => saveCompanyMeeting(meeting),
                  () => setMeeting(null),
                )
              }}
            >
              <h4 className="flex items-center gap-2 font-semibold text-violet-950 sm:col-span-2">
                <CalendarPlus size={18} />
                {meeting.revision ? "Editar reunião" : "Agendar reunião"}
              </h4>
              <label className="space-y-1 text-xs">
                Empresa
                <input readOnly className={field} value={companyName} />
              </label>
              <label className="space-y-1 text-xs">
                Responsável da empresa
                <select
                  required
                  className={field}
                  value={meeting.contactId}
                  onChange={(e) => setMeeting({ ...meeting, contactId: e.target.value })}
                >
                  <option value="">Selecione</option>
                  {data.contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                      {c.is_primary ? " · Principal" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs">
                E-mail do responsável
                <input
                  readOnly
                  className={field}
                  value={selected?.email || "Cadastre o e-mail na ficha do responsável"}
                />
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="space-y-1 text-xs">
                  Organizador
                  <input readOnly className={field} value={data.organizer.name} />
                </label>
                <label className="space-y-1 text-xs">
                  E-mail do organizador
                  <input readOnly className={field} value={data.microsoft.email || data.organizer.email} />
                </label>
              </div>
              <label className="space-y-1 text-xs">
                Data
                <input
                  type="date"
                  required
                  className={field}
                  value={meeting.date}
                  onChange={(e) => setMeeting({ ...meeting, date: e.target.value })}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-xs">
                  Horário de início
                  <input
                    type="time"
                    required
                    className={field}
                    value={meeting.startTime}
                    onChange={(e) => setMeeting({ ...meeting, startTime: e.target.value })}
                  />
                </label>
                <label className="space-y-1 text-xs">
                  Horário de término
                  <input
                    type="time"
                    required
                    className={field}
                    value={meeting.endTime}
                    onChange={(e) => setMeeting({ ...meeting, endTime: e.target.value })}
                  />
                </label>
              </div>
              <p className="text-xs text-slate-500 sm:col-span-2">Horário de Brasília (São Paulo).</p>
              <label className="space-y-1 text-xs">
                Assunto da reunião
                <input
                  required
                  maxLength={180}
                  className={field}
                  value={meeting.title}
                  onChange={(e) => setMeeting({ ...meeting, title: e.target.value })}
                />
              </label>
              <label className="space-y-1 text-xs">
                Modalidade
                <select
                  className={field}
                  value={meeting.meetingType}
                  onChange={(e) =>
                    setMeeting({ ...meeting, meetingType: e.target.value as MeetingInput["meetingType"] })
                  }
                >
                  <option value="presencial">Presencial</option>
                  <option value="teams">Online via Microsoft Teams</option>
                </select>
              </label>
              {meeting.meetingType === "presencial" && (
                <label className="space-y-1 text-xs sm:col-span-2">
                  Local / endereço
                  <input
                    required
                    maxLength={300}
                    className={field}
                    value={meeting.location}
                    onChange={(e) => setMeeting({ ...meeting, location: e.target.value })}
                  />
                </label>
              )}
              {oldMeeting?.teams_meeting_url && meeting.meetingType === "presencial" && (
                <p className="rounded bg-amber-50 p-2 text-xs text-amber-900 sm:col-span-2">
                  O convite será atualizado para presencial no mesmo evento. A Microsoft mantém o link Teams
                  que já foi criado.
                </p>
              )}
              <label className="space-y-1 text-xs sm:col-span-2">
                Descrição / pauta
                <textarea
                  rows={3}
                  maxLength={10000}
                  className={field}
                  value={meeting.description}
                  onChange={(e) => setMeeting({ ...meeting, description: e.target.value })}
                />
              </label>
              <fieldset className="space-y-2 sm:col-span-2">
                <legend className="mb-2 text-sm font-medium">Participantes adicionais — opcional</legend>
                {meeting.participants.map((p, index) => (
                  <div key={index} className="flex items-end gap-2">
                    <div className="grid flex-1 gap-2 sm:grid-cols-2">
                      <label className="space-y-1 text-xs">
                        Nome
                        <input
                          maxLength={160}
                          className={field}
                          value={p.name}
                          onChange={(e) =>
                            setMeeting({
                              ...meeting,
                              participants: meeting.participants.map((v, i) =>
                                i === index ? { ...v, name: e.target.value } : v,
                              ),
                            })
                          }
                        />
                      </label>
                      <label className="space-y-1 text-xs">
                        E-mail
                        <input
                          type="email"
                          required
                          maxLength={254}
                          className={field}
                          value={p.email}
                          onChange={(e) =>
                            setMeeting({
                              ...meeting,
                              participants: meeting.participants.map((v, i) =>
                                i === index ? { ...v, email: e.target.value } : v,
                              ),
                            })
                          }
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remover participante ${index + 1}`}
                      className="p-2 text-rose-600"
                      onClick={() =>
                        setMeeting({
                          ...meeting,
                          participants: meeting.participants.filter((_, i) => i !== index),
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className={secondary}
                  disabled={meeting.participants.length >= 100}
                  onClick={() =>
                    setMeeting({
                      ...meeting,
                      participants: [...meeting.participants, { name: "", email: "" }],
                    })
                  }
                >
                  <Plus size={14} />
                  Adicionar participante +
                </button>
              </fieldset>
              <p className="text-xs text-slate-500 sm:col-span-2">
                O Outlook enviará o convite ao responsável e aos participantes adicionais. Seu calendário será
                o do organizador.
              </p>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <button type="button" className={secondary} disabled={busy} onClick={() => setMeeting(null)}>
                  Fechar
                </button>
                <button className={primary} disabled={busy || !selected?.email}>
                  {busy ? <Loader2 className="animate-spin" size={16} /> : <CalendarPlus size={16} />}{" "}
                  {meeting.revision ? "Salvar e atualizar convite" : "Agendar e enviar convites"}
                </button>
              </div>
            </form>
          )}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900">
                Histórico de reuniões{" "}
                <span className="font-normal text-slate-500">({data.meetings.length})</span>
              </h4>
              <button type="button" className={secondary} disabled={busy} onClick={() => void reload()}>
                <RefreshCw size={13} />
                Atualizar ficha
              </button>
            </div>
            {!data.meetings.length && (
              <p className="text-xs text-slate-500">Nenhuma reunião agendada para esta empresa.</p>
            )}
            <ol className="space-y-3">
              {data.meetings.map((row) => {
                const mine = row.organizer_user_id === data.organizer.id,
                  ended = ["cancelada", "realizada", "nao_compareceu"].includes(row.status)
                return (
                  <li key={row.id} className="space-y-2 rounded-xl border border-slate-200 p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h5 className="text-sm font-semibold text-slate-900">{row.title}</h5>
                      <span className="rounded-full bg-violet-50 px-2 py-1 font-medium text-violet-800">
                        {MEETING_STATUSES[row.status] || row.status}
                      </span>
                    </div>
                    <p className="font-medium text-slate-700">
                      {showDate(row.start_at)} até {localParts(row.end_at).slice(11, 16)} ·{" "}
                      {row.meeting_type === "teams" ? "Online via Microsoft Teams" : "Presencial"}
                    </p>
                    {row.location && <p>Local: {row.location}</p>}
                    <p>
                      Responsável: {row.contato} · <span className="break-all">{row.contact_email}</span>
                    </p>
                    <p>
                      Organizador: {row.organizer_name} ·{" "}
                      <span className="break-all">{row.organizer_email}</span>
                    </p>
                    {row.activity_participants.length > 0 && (
                      <p>
                        Adicionais:{" "}
                        {row.activity_participants
                          .map((p) => (p.name ? `${p.name} (${p.email})` : p.email))
                          .join("; ")}
                      </p>
                    )}
                    {row.description && (
                      <p className="whitespace-pre-wrap text-slate-600">{row.description}</p>
                    )}
                    {row.sync_status !== "synced" && (
                      <div role="status" className="rounded-lg bg-amber-50 p-2 text-amber-900">
                        <p>
                          {row.sync_operation === "cancel"
                            ? "Cancelamento pendente no Outlook."
                            : row.sync_operation === "update"
                              ? "Alterações aguardando sincronização com o Outlook."
                              : "Envio do convite pendente."}
                        </p>
                        {row.sync_error && <p className="mt-1">{row.sync_error}</p>}
                        {mine && (
                          <button
                            type="button"
                            className={`${secondary} mt-2`}
                            disabled={
                              busy ||
                              (row.sync_status === "syncing" &&
                                !!row.sync_locked_at &&
                                Date.parse(row.sync_locked_at) > snapshotAt - 300000)
                            }
                            onClick={() => void run(() => retryCompanyMeeting(row.id))}
                          >
                            <RefreshCw size={13} />
                            Tentar sincronizar
                          </button>
                        )}
                      </div>
                    )}
                    {row.sync_status === "synced" && (
                      <p className="text-emerald-700">
                        {row.status === "cancelada"
                          ? "Cancelamento registrado no Outlook."
                          : "Sincronizada com o Outlook."}
                      </p>
                    )}
                    {!!row.meeting_rsvp?.length && (
                      <p className="text-slate-500">
                        Respostas:{" "}
                        {row.meeting_rsvp
                          .map((p) => `${p.email}: ${responses[p.response] || p.response}`)
                          .join("; ")}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {safeLink(row.teams_meeting_url) && row.status !== "cancelada" && (
                        <a
                          href={safeLink(row.teams_meeting_url)}
                          target="_blank"
                          rel="noreferrer"
                          className={secondary}
                        >
                          <Video size={13} />
                          {row.meeting_type === "teams" ? "Entrar no Teams" : "Link Teams original"}
                        </a>
                      )}
                      {safeLink(row.outlook_web_url) && (
                        <a
                          href={safeLink(row.outlook_web_url)}
                          target="_blank"
                          rel="noreferrer"
                          className={secondary}
                        >
                          Abrir no Outlook
                        </a>
                      )}
                      {mine && row.sync_status === "synced" && !ended && (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            className={secondary}
                            onClick={() => editMeeting(row)}
                          >
                            <Pencil size={13} />
                            Editar
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            className={secondary}
                            onClick={() => void run(() => refreshCompanyMeeting(row.id))}
                          >
                            <RefreshCw size={13} />
                            Consultar respostas
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            className={secondary}
                            onClick={() => setCancelId(row.id)}
                          >
                            <X size={13} />
                            Cancelar reunião
                          </button>
                          <label className="flex items-center gap-2 text-slate-500">
                            Registrar status
                            <select
                              aria-label={`Registrar status de ${row.title}`}
                              className="rounded-lg border border-slate-300 bg-white p-2"
                              disabled={busy}
                              value=""
                              onChange={(e) => {
                                if (e.target.value)
                                  void run(() =>
                                    setCompanyMeetingStatus(
                                      row.id,
                                      row.revision,
                                      e.target.value as MeetingStatus,
                                    ),
                                  )
                              }}
                            >
                              <option value="">Selecionar…</option>
                              <option value="reagendamento_solicitado">Reagendamento solicitado</option>
                              <option value="agendada">Agendada</option>
                              <option value="realizada">Realizada</option>
                              <option value="nao_compareceu">Não compareceu</option>
                            </select>
                          </label>
                        </>
                      )}
                    </div>
                    {cancelId === row.id && (
                      <div className="rounded-lg bg-rose-50 p-3 text-rose-900">
                        <p>
                          Cancelar “{row.title}”? O Outlook enviará o cancelamento aos participantes e o
                          histórico será mantido.
                        </p>
                        <div className="mt-2 flex gap-2">
                          <button className={secondary} disabled={busy} onClick={() => setCancelId(null)}>
                            Voltar
                          </button>
                          <button
                            className="rounded-lg bg-rose-700 px-3 py-2 font-medium text-white disabled:opacity-50"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                () => cancelCompanyMeeting(row.id, row.revision),
                                () => setCancelId(null),
                              )
                            }
                          >
                            Confirmar cancelamento
                          </button>
                        </div>
                      </div>
                    )}
                    <details className="text-slate-400">
                      <summary>Detalhes do registro</summary>
                      <p className="mt-1">Criada em {showDate(row.created_at)}</p>
                      <p className="mt-1 break-all">
                        Outlook Event ID: {row.outlook_event_id || "Aguardando criação"}
                      </p>
                    </details>
                  </li>
                )
              })}
            </ol>
            <p className="mt-3 text-xs text-slate-500">
              A confirmação considera o aceite do responsável principal. Consulte propostas de novo horário no
              Outlook e registre “Reagendamento solicitado” aqui.
            </p>
          </div>
        </>
      )}
    </section>
  )
}
