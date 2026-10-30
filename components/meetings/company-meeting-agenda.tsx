"use client"

import { useEffect, useState } from "react"
import { loadCompanyMeetingAgenda } from "@/app/actions/contact-meetings"
import { CONTACT_MEETING_STATUS_LABELS, contactMeetingTitle, summarizeMeetingDeliveries, type ContactMeeting } from "@/lib/meetings/contact-domain"

export function CompanyMeetingAgenda({ onOpen, refreshToken }: { onOpen: (id: string) => void; refreshToken?: unknown }) {
  const [meetings, setMeetings] = useState<ContactMeeting[]>([])
  const [error, setError] = useState("")
  useEffect(() => {
    let active = true
    loadCompanyMeetingAgenda().then(result => {
      if (!active) return
      if (result.ok) setMeetings(result.meetings)
      else setError(result.message)
    }).catch(() => { if (active) setError("Não foi possível carregar as reuniões. Atualize a agenda.") })
    return () => { active = false }
  }, [refreshToken])
  return <section aria-label="Reuniões B2B com convites" className="mb-4 space-y-3 rounded-xl border border-slate-200 bg-white p-3">
    <h3 className="text-sm font-semibold">Reuniões B2B com convites</h3>
    <p className="text-xs text-slate-500">Até 250 reuniões dos próximos 90 dias. Remarcação, cancelamento e resultado ficam no painel Reuniões e convites da ficha.</p>
    {error && <p role="status" className="text-xs text-rose-700">{error}</p>}
    {!meetings.length && !error && <p className="text-xs text-slate-500">Nenhuma nova reunião neste período.</p>}
    <ul className="grid min-w-0 gap-3 sm:grid-cols-2">{meetings.map(meeting => <li key={meeting.id} className="min-w-0 space-y-2 rounded-lg border p-3 text-xs">
      <p className="break-words font-semibold">{contactMeetingTitle(meeting)}</p>
      <p>{new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(meeting.start_at))} · {CONTACT_MEETING_STATUS_LABELS[meeting.status]}</p>
      <p>{summarizeMeetingDeliveries(meeting.contact_meeting_jobs)?.label || "Envio pendente"}</p>
      {meeting.meeting_url && <a href={meeting.meeting_url} className="block break-all text-[#88005b] underline" target="_blank" rel="noreferrer">Entrar na reunião (Teams)</a>}
      <button type="button" className="min-h-10 rounded-lg border px-3 py-2" onClick={() => onOpen(meeting.company_id!)}>Abrir ficha e histórico</button>
    </li>)}</ul>
  </section>
}
