"use client"

import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Mail,
  MapPin,
  Plus,
  RefreshCw,
  Settings2,
  Sparkles,
  UserRound,
  Users,
  X,
} from "lucide-react"
import {
  ACTIVITY_LABEL,
  ACTIVITY_STYLE,
  LANE_LABEL,
  type AttendanceActivity,
  type AttendanceLane,
  addDays,
  formatDateBr,
  mondayOf,
  monthRange,
  sundayOf,
  weekdayOf,
} from "@/lib/domain/attendance"
import {
  cancelOccurrence,
  processCalendarQueue,
  publishCycle,
  saveAbsence,
  saveAttendanceException,
  saveAttendanceSettings,
  saveOccurrence,
  saveSuggestedDraft,
  updateTeamSlot,
} from "@/app/actions/attendance"
import { loadAttendanceRange, previewAttendanceSchedule } from "@/app/actions/attendance-ui"
import { updateRotationEntry } from "@/app/actions/attendance-template"

const purple = "#88005b"
const orange = "#FA4616"
const btnPrimary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#88005b] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#70004b] disabled:cursor-not-allowed disabled:opacity-50"
const btnSecondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
const inputCls = "h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#88005b] focus:ring-2 focus:ring-[#88005b]/10"
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500"
const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

function Modal({ title, children, onClose, wide = false }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[1px] sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl ${wide ? "sm:max-w-5xl" : "sm:max-w-2xl"}`}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </div>
  )
}

function InviteBadge({ invite, status }: { invite?: any; status: string }) {
  if (status === "draft") return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">Rascunho</span>
  if (status === "cancelled") return <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">Cancelado</span>
  if (!invite) return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">Convite pendente</span>
  const operation = invite.operation
  const st = invite.status
  let label = "Pendente"
  let cls = "bg-amber-50 text-amber-700"
  if (st === "processing") { label = "Em processamento"; cls = "bg-sky-50 text-sky-700" }
  if (st === "sent_provider") { label = "Enviado ao provedor"; cls = "bg-emerald-50 text-emerald-700" }
  if (st === "failed") { label = "Falha"; cls = "bg-rose-50 text-rose-700" }
  if (st === "pending" && operation === "CANCEL") label = "Cancelamento pendente"
  else if (st === "pending" && Number(invite.event_sequence || 0) > 0) label = "Atualização pendente"
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>
}

function OccurrenceCard({ occ, canManage, onEdit }: { occ: any; canManage: boolean; onEdit: (o: any) => void }) {
  return (
    <button
      type="button"
      onClick={() => canManage && onEdit(occ)}
      className={`w-full rounded-xl border p-2.5 text-left transition ${ACTIVITY_STYLE[occ.activity as AttendanceActivity]} ${canManage ? "hover:-translate-y-0.5 hover:shadow-sm" : "cursor-default"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">{ACTIVITY_LABEL[occ.activity as AttendanceActivity]}</p>
          <p className="mt-0.5 truncate text-[11px] opacity-80">{occ.responsibleName}</p>
        </div>
        <span className="shrink-0 font-mono text-[10px]">{occ.startTime}–{occ.endTime}</span>
      </div>
      {occ.breakStart && occ.breakEnd && <p className="mt-1 text-[10px] opacity-75">Intervalo {occ.breakStart}–{occ.breakEnd}</p>}
      <div className="mt-1.5"><InviteBadge invite={occ.invite} status={occ.status} /></div>
    </button>
  )
}

function ListView({ occurrences, canManage, onEdit }: { occurrences: any[]; canManage: boolean; onEdit: (o: any) => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const occ of occurrences) map.set(occ.date, [...(map.get(occ.date) ?? []), occ])
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [occurrences])
  if (!groups.length) return <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">Nenhum compromisso neste período.</div>
  return (
    <div className="space-y-4">
      {groups.map(([date, items]) => (
        <section key={date} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">{dayNames[weekdayOf(date)]}, {formatDateBr(date)}</h3>
            <span className="text-xs text-slate-400">{items.length} compromisso(s)</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{items.map((o) => <OccurrenceCard key={o.id} occ={o} canManage={canManage} onEdit={onEdit} />)}</div>
        </section>
      ))}
    </div>
  )
}

function WeekView({ start, occurrences, canManage, onEdit }: { start: string; occurrences: any[]; canManage: boolean; onEdit: (o: any) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  return (
    <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
      <div className="grid min-w-[1000px] grid-cols-7 border-b border-slate-200 bg-slate-50">
        {days.map((date) => <div key={date} className="border-r border-slate-200 px-3 py-2.5 last:border-r-0"><p className="text-xs font-semibold text-slate-700">{dayNames[weekdayOf(date)]}</p><p className="text-[11px] text-slate-400">{formatDateBr(date)}</p></div>)}
      </div>
      <div className="grid min-h-[520px] min-w-[1000px] grid-cols-7">
        {days.map((date) => {
          const items = occurrences.filter((o) => o.date === date)
          return <div key={date} className="space-y-2 border-r border-slate-100 p-2 last:border-r-0">{items.map((o) => <OccurrenceCard key={o.id} occ={o} canManage={canManage} onEdit={onEdit} />)}</div>
        })}
      </div>
    </div>
  )
}

function MonthView({ anchor, occurrences, canManage, onEdit }: { anchor: string; occurrences: any[]; canManage: boolean; onEdit: (o: any) => void }) {
  const { start, end } = monthRange(anchor)
  const gridStart = mondayOf(start)
  const gridEnd = sundayOf(end)
  const days: string[] = []
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d)
  return (
    <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
      <div className="grid min-w-[980px] grid-cols-7 border-b border-slate-200 bg-slate-50">{["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => <div key={d} className="px-3 py-2 text-xs font-semibold text-slate-500">{d}</div>)}</div>
      <div className="grid min-w-[980px] grid-cols-7">
        {days.map((date) => {
          const inMonth = date >= start && date <= end
          const items = occurrences.filter((o) => o.date === date)
          return (
            <div key={date} className={`min-h-[150px] border-b border-r border-slate-100 p-2 ${inMonth ? "bg-white" : "bg-slate-50/70"}`}>
              <p className={`mb-2 text-[11px] font-semibold ${inMonth ? "text-slate-600" : "text-slate-300"}`}>{date.slice(-2)}</p>
              <div className="space-y-1.5">{items.slice(0, 4).map((o) => <OccurrenceCard key={o.id} occ={o} canManage={canManage} onEdit={onEdit} />)}{items.length > 4 && <p className="text-center text-[10px] text-slate-400">+{items.length - 4}</p>}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function AttendanceBoard({ initial, personalOnly = false }: { initial: any; personalOnly?: boolean }) {
  const router = useRouter()
  const [data, setData] = useState(initial)
  const [view, setView] = useState<"week" | "month" | "list">("week")
  const [anchor, setAnchor] = useState(initial.start)
  const [userFilter, setUserFilter] = useState(personalOnly ? initial.actor.id : "")
  const [activityFilter, setActivityFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [modal, setModal] = useState<null | "suggest" | "new" | "settings" | "model" | "exception" | "absence" | { edit: any }>(null)
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const canManage = Boolean(data.manager && !personalOnly)

  const range = useMemo(() => view === "month" ? monthRange(anchor) : view === "week" ? { start: mondayOf(anchor), end: sundayOf(anchor) } : { start: data.start, end: data.end }, [anchor, data.end, data.start, view])

  const reload = async (nextRange = range) => {
    const fresh = await loadAttendanceRange({ start: nextRange.start, end: nextRange.end, userId: personalOnly ? data.actor.id : userFilter || undefined, activity: activityFilter || undefined, status: statusFilter || undefined })
    setData(fresh)
  }

  const filtered = useMemo(() => (data.occurrences ?? []).filter((o: any) => {
    if (o.date < range.start || o.date > range.end) return false
    if (userFilter && o.userId !== userFilter) return false
    if (activityFilter && o.activity !== activityFilter) return false
    if (statusFilter && o.status !== statusFilter) return false
    return true
  }), [data.occurrences, range, userFilter, activityFilter, statusFilter])

  const navigate = (direction: number) => {
    let nextAnchor = anchor
    if (view === "month") {
      const [y, m] = anchor.split("-").map(Number)
      const d = new Date(Date.UTC(y, m - 1 + direction, 1))
      nextAnchor = d.toISOString().slice(0, 10)
    } else nextAnchor = addDays(anchor, direction * 7)
    setAnchor(nextAnchor)
    const nextRange = view === "month" ? monthRange(nextAnchor) : { start: mondayOf(nextAnchor), end: sundayOf(nextAnchor) }
    startTransition(() => { void reload(nextRange) })
  }

  const action = (fn: () => Promise<any>, after?: () => void) => {
    startTransition(async () => {
      const result = await fn()
      setFeedback({ ok: Boolean(result?.ok), message: result?.message || "Operação concluída." })
      if (result?.ok) {
        after?.()
        await reload()
        router.refresh()
      }
    })
  }

  const draftCycles = (data.cycles ?? []).filter((c: any) => c.status === "draft")

  return (
    <div className="mx-auto max-w-[1600px]">
      <header className="mb-5 rounded-2xl border border-[#e6d7e1] bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 h-1 w-9 rounded-full" style={{ background: orange }} />
            <div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-[#88005b]" /><h1 className="text-2xl font-bold tracking-[-0.03em] text-slate-950">{personalOnly ? "Minha agenda" : "Atendimento"}</h1></div>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">{personalOnly ? "Sua programação publicada no UniConecta." : "Escala operacional da sala de matrícula, conversão e atividade externa."}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!personalOnly && <Link href="/atendimento/minha-agenda" className={btnSecondary}><UserRound className="h-4 w-4" />Minha agenda</Link>}
            {canManage && <button className={btnSecondary} onClick={() => setModal("settings")}><Settings2 className="h-4 w-4" />Configurar</button>}
            {canManage && <button className={btnSecondary} onClick={() => setModal("new")}><Plus className="h-4 w-4" />Novo compromisso</button>}
            {canManage && <button className={btnPrimary} onClick={() => setModal("suggest")}><Sparkles className="h-4 w-4" />Aplicar escala sugerida</button>}
          </div>
        </div>
      </header>

      {!data.providerStatus?.configured && canManage && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Mail className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">{data.providerStatus?.error ? "Não foi possível verificar o serviço de convites" : "Convites por e-mail pendentes de configuração"}</p>
            <p className="mt-0.5 text-xs leading-relaxed">{data.providerStatus?.error
              ? "A consulta ao serviço falhou. Atualize a página para tentar novamente. Se persistir, solicite a verificação da conexão com o serviço de envio."
              : "A escala pode ser publicada, mas os convites dependem da configuração de um serviço de e-mail e de um remetente autorizado."}</p>
            {Array.isArray(data.providerStatus?.missing) && data.providerStatus.missing.length > 0 && (
              <p className="mt-2 text-xs leading-relaxed">Falta configurar: {data.providerStatus.missing.map((key: string) => ({
                CALENDAR_SMTP_HOST: "servidor de envio",
                CALENDAR_SMTP_PASS: "credencial do serviço de envio",
                CALENDAR_SMTP_USER: "usuário do serviço de envio",
                CALENDAR_FROM_EMAIL: "remetente",
                CALENDAR_ORGANIZER_EMAIL: "organizador dos convites",
                CALENDAR_OAUTH_TENANT_ID: "organização Microsoft 365",
                CALENDAR_OAUTH_CLIENT_ID: "aplicativo Microsoft 365",
                CALENDAR_OAUTH_CLIENT_SECRET: "credencial do aplicativo Microsoft 365",
              } as Record<string, string>)[key] || "parâmetro do serviço").join(", ")}.</p>
            )}
            {Array.isArray(data.providerStatus?.invalid) && data.providerStatus.invalid.length > 0 && (
              <p className="mt-2 text-xs leading-relaxed">Há configurações inválidas no serviço de e-mail. Verifique o provedor, a porta e os endereços do remetente e do organizador.</p>
            )}
          </div>
        </div>
      )}

      {feedback && <div className={`mb-4 rounded-xl border px-4 py-2.5 text-sm ${feedback.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{feedback.message}</div>}

      {canManage && draftCycles.length > 0 && (
        <div className="mb-4 rounded-2xl border border-violet-200 bg-violet-50/70 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-sm font-semibold text-violet-900">Rascunhos aguardando publicação</p><p className="text-xs text-violet-700">Publicar valida conflitos, cobertura e e-mails antes de enfileirar convites.</p></div>
            <div className="flex flex-wrap gap-2">{draftCycles.slice(0, 3).map((cycle: any) => <button key={cycle.id} className={btnPrimary} disabled={pending} onClick={() => action(() => publishCycle(cycle.id))}>Publicar {formatDateBr(cycle.period_start)}–{formatDateBr(cycle.period_end)}</button>)}</div>
          </div>
        </div>
      )}

      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            {(["week", "month", "list"] as const).map((v) => <button key={v} onClick={() => setView(v)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${view === v ? "bg-white text-[#88005b] shadow-sm" : "text-slate-500"}`}>{v === "week" ? "Semana" : v === "month" ? "Mês" : "Lista"}</button>)}
          </div>
          {view !== "list" && <div className="flex items-center gap-1"><button className={btnSecondary} onClick={() => navigate(-1)} aria-label="Anterior"><ChevronLeft className="h-4 w-4" /></button><button className={btnSecondary} onClick={() => navigate(1)} aria-label="Próximo"><ChevronRight className="h-4 w-4" /></button></div>}
          <div className="min-w-[180px] flex-1 sm:max-w-[240px]"><label className={labelCls}>Consultor</label><select className={inputCls} value={userFilter} disabled={personalOnly} onChange={(e) => setUserFilter(e.target.value)}><option value="">Todos</option>{(data.members ?? []).filter((m: any) => m.attendanceEnabled || m.id === data.actor.id).map((m: any) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</select></div>
          <div className="min-w-[170px]"><label className={labelCls}>Atividade</label><select className={inputCls} value={activityFilter} onChange={(e) => setActivityFilter(e.target.value)}><option value="">Todas</option><option value="room">Sala de matrícula</option><option value="conversion">Conversão</option><option value="external">Atividade externa</option></select></div>
          <div className="min-w-[150px]"><label className={labelCls}>Situação</label><select className={inputCls} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">Todas</option><option value="draft">Rascunho</option><option value="published">Publicado</option><option value="cancelled">Cancelado</option></select></div>
          <button className={btnSecondary} disabled={pending} onClick={() => startTransition(() => { void reload() })}><RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />Atualizar</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500"><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-violet-400" />Sala de matrícula</span><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-amber-400" />Conversão</span><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-sky-400" />Atividade externa</span><span>Fuso: São Paulo/Brasília</span></div>
      </section>

      {view === "week" && <WeekView start={range.start} occurrences={filtered} canManage={canManage} onEdit={(o) => setModal({ edit: o })} />}
      {view === "month" && <MonthView anchor={anchor} occurrences={filtered} canManage={canManage} onEdit={(o) => setModal({ edit: o })} />}
      {(view === "list") && <ListView occurrences={filtered} canManage={canManage} onEdit={(o) => setModal({ edit: o })} />}
      {view !== "list" && <div className="mt-4 md:hidden"><ListView occurrences={filtered} canManage={canManage} onEdit={(o) => setModal({ edit: o })} /></div>}

      <p className="mt-4 text-xs leading-relaxed text-slate-400">O status “Enviado ao provedor” confirma somente o envio pelo servidor de e-mail. A inclusão/aceitação no Outlook depende das configurações e da ação do destinatário; esta versão não lê respostas Aceito/Recusado nem conflitos do calendário externo.</p>

      {modal === "suggest" && <SuggestModal data={data} pending={pending} onClose={() => setModal(null)} onFeedback={setFeedback} onReload={async (start, end) => { setAnchor(start); const fresh = await loadAttendanceRange({ start, end }); setData(fresh) }} />}
      {modal === "new" && <OccurrenceEditor data={data} pending={pending} onClose={() => setModal(null)} onSave={(payload) => action(() => saveOccurrence(payload), () => setModal(null))} />}
      {typeof modal === "object" && modal?.edit && <OccurrenceEditor data={data} occurrence={modal.edit} pending={pending} onClose={() => setModal(null)} onSave={(payload) => action(() => saveOccurrence(payload), () => setModal(null))} onCancel={() => action(() => cancelOccurrence(modal.edit.id), () => setModal(null))} />}
      {modal === "settings" && <SettingsModal data={data} pending={pending} onClose={() => setModal(null)} action={action} openModel={() => setModal("model")} openException={() => setModal("exception")} openAbsence={() => setModal("absence")} />}
      {modal === "model" && <ModelModal data={data} pending={pending} onClose={() => setModal("settings")} action={action} />}
      {modal === "exception" && <ExceptionModal pending={pending} onClose={() => setModal("settings")} action={action} />}
      {modal === "absence" && <AbsenceModal data={data} pending={pending} onClose={() => setModal("settings")} action={action} />}
    </div>
  )
}

function SuggestModal({ data, pending, onClose, onFeedback, onReload }: any) {
  const [cycleStart, setCycleStart] = useState(data.settings.scheduleStartDate)
  const [periodStart, setPeriodStart] = useState(data.settings.scheduleStartDate)
  const [periodEnd, setPeriodEnd] = useState(addDays(data.settings.scheduleStartDate, 27))
  const [preview, setPreview] = useState<any>(null)
  const [replace, setReplace] = useState(false)
  const [busy, start] = useTransition()
  const gerar = () => start(async () => {
    const r: any = await previewAttendanceSchedule({ cycleStart, periodStart, periodEnd })
    if (r?.ok) setPreview(r.preview)
    else onFeedback({ ok: false, message: r?.message || "Falha ao gerar prévia." })
  })
  const salvar = () => start(async () => {
    const r: any = await saveSuggestedDraft({ cycleStart, periodStart, periodEnd }, replace)
    onFeedback({ ok: Boolean(r?.ok), message: r?.message || "Operação concluída." })
    if (r?.ok) { await onReload(periodStart, periodEnd); onClose() }
  })
  return (
    <Modal title="Aplicar escala sugerida" onClose={onClose} wide>
      <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-800">O ciclo começa em 26/10/2026 e repete as semanas 1–4 continuamente, inclusive na troca de mês. Gerar prévia não salva e não envia convites.</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><div><label className={labelCls}>Início do ciclo</label><input type="date" min={data.settings.scheduleStartDate} className={inputCls} value={cycleStart} onChange={(e) => setCycleStart(e.target.value)} /></div><div><label className={labelCls}>Preencher de</label><input type="date" min={data.settings.scheduleStartDate} className={inputCls} value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></div><div><label className={labelCls}>Até</label><input type="date" min={periodStart} className={inputCls} value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></div></div>
      <div className="mt-4 flex flex-wrap gap-2"><button className={btnPrimary} disabled={busy || pending} onClick={gerar}><Sparkles className="h-4 w-4" />Gerar prévia</button></div>
      {preview && <div className="mt-5 space-y-4"><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-500">Compromissos</p><p className="mt-1 text-2xl font-semibold text-slate-900">{preview.occurrences.length}</p></div><div className="rounded-xl border border-rose-200 bg-rose-50 p-3"><p className="text-xs text-rose-600">Erros</p><p className="mt-1 text-2xl font-semibold text-rose-700">{preview.issues.filter((i: any) => i.severity === "error").length}</p></div><div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs text-amber-700">Alertas</p><p className="mt-1 text-2xl font-semibold text-amber-800">{preview.issues.filter((i: any) => i.severity === "warning").length}</p></div></div>
        {preview.issues.length > 0 && <div className="max-h-52 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 p-3">{preview.issues.map((i: any, idx: number) => <div key={idx} className={`flex gap-2 rounded-lg px-2.5 py-2 text-xs ${i.severity === "error" ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-800"}`}><CircleAlert className="h-4 w-4 shrink-0" /><span>{i.message}</span></div>)}</div>}
        <div className="max-h-72 overflow-auto rounded-xl border border-slate-200"><table className="w-full min-w-[720px] text-xs"><thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><th className="px-3 py-2 text-left">Data</th><th className="px-3 py-2 text-left">Responsável</th><th className="px-3 py-2 text-left">Atividade</th><th className="px-3 py-2 text-left">Horário</th><th className="px-3 py-2 text-left">Intervalo</th></tr></thead><tbody>{preview.occurrences.slice(0, 120).map((o: any, idx: number) => <tr key={`${o.seriesKey}-${o.date}-${idx}`} className="border-t border-slate-100"><td className="px-3 py-2">{formatDateBr(o.date)}</td><td className="px-3 py-2">{o.responsibleName}{!o.userId && <span className="ml-1 text-rose-600">· sem vínculo</span>}</td><td className="px-3 py-2">{ACTIVITY_LABEL[o.activity as AttendanceActivity]}</td><td className="px-3 py-2 font-mono">{o.startTime}–{o.endTime}</td><td className="px-3 py-2 font-mono">{o.breakStart ? `${o.breakStart}–${o.breakEnd}` : "—"}</td></tr>)}</tbody></table></div>
        <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700"><input type="checkbox" className="mt-0.5 accent-[#88005b]" checked={replace} onChange={(e) => setReplace(e.target.checked)} /><span><strong>Substituir rascunhos existentes no período.</strong> Compromissos já publicados nunca são sobrescritos automaticamente.</span></label>
        <div className="flex justify-end gap-2"><button className={btnSecondary} onClick={onClose}>Cancelar</button><button className={btnPrimary} disabled={busy} onClick={salvar}>Salvar como rascunho</button></div>
      </div>}
    </Modal>
  )
}

function OccurrenceEditor({ data, occurrence, pending, onClose, onSave, onCancel }: any) {
  const isEdit = Boolean(occurrence)
  const [userId, setUserId] = useState(occurrence?.userId || "")
  const [activity, setActivity] = useState<AttendanceActivity>(occurrence?.activity || "room")
  const [date, setDate] = useState(occurrence?.date || data.settings.scheduleStartDate)
  const [startTime, setStartTime] = useState(occurrence?.startTime || "09:00")
  const [endTime, setEndTime] = useState(occurrence?.endTime || "18:00")
  const [breakStart, setBreakStart] = useState(occurrence?.breakStart || "")
  const [breakEnd, setBreakEnd] = useState(occurrence?.breakEnd || "")
  const [location, setLocation] = useState(occurrence?.location || data.settings.roomLocation)
  const [notes, setNotes] = useState(occurrence?.notes || "")
  const [scope, setScope] = useState<"occurrence" | "week" | "future">("occurrence")
  const submit = (e: React.FormEvent) => { e.preventDefault(); onSave({ id: occurrence?.id, scope, userId: userId || null, activity, date, startTime, endTime, breakStart: breakStart || null, breakEnd: breakEnd || null, location, notes }) }
  return (
    <Modal title={isEdit ? "Editar compromisso" : "Novo compromisso"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2"><div><label className={labelCls}>Responsável</label><select className={inputCls} value={userId} onChange={(e) => setUserId(e.target.value)}><option value="">Sem vínculo</option>{data.members.filter((m: any) => m.attendanceEnabled).map((m: any) => <option key={m.id} value={m.id}>{m.full_name} · {m.email}</option>)}</select></div><div><label className={labelCls}>Atividade</label><select className={inputCls} value={activity} onChange={(e) => setActivity(e.target.value as AttendanceActivity)}><option value="room">Sala de matrícula</option><option value="conversion">Conversão</option><option value="external">Atividade externa</option></select></div></div>
        <div className="grid gap-3 sm:grid-cols-3"><div><label className={labelCls}>Data</label><input type="date" min={data.settings.scheduleStartDate} className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></div><div><label className={labelCls}>Início</label><input type="time" className={inputCls} value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div><div><label className={labelCls}>Fim</label><input type="time" className={inputCls} value={endTime} onChange={(e) => setEndTime(e.target.value)} /></div></div>
        <div className="grid gap-3 sm:grid-cols-2"><div><label className={labelCls}>Intervalo início</label><input type="time" className={inputCls} value={breakStart} onChange={(e) => setBreakStart(e.target.value)} /></div><div><label className={labelCls}>Intervalo fim</label><input type="time" className={inputCls} value={breakEnd} onChange={(e) => setBreakEnd(e.target.value)} /></div></div>
        <div><label className={labelCls}>Local</label><input className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} /></div>
        <div><label className={labelCls}>Observações</label><textarea className="min-h-24 w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-[#88005b] focus:ring-2 focus:ring-[#88005b]/10" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        {isEdit && occurrence?.cycleId && <div><label className={labelCls}>Aplicar alteração em</label><select className={inputCls} value={scope} onChange={(e) => setScope(e.target.value as any)}><option value="occurrence">Somente esta ocorrência</option><option value="week">Esta semana, na mesma posição do rodízio</option><option value="future">Próximas ocorrências desta posição no período gerado</option></select><p className="mt-1 text-[11px] text-slate-500">A abrangência é mostrada antes do salvamento. A alteração não modifica o modelo de rodízio.</p></div>}
        <div className="flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-4">{isEdit && onCancel ? <button type="button" onClick={onCancel} className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50">Cancelar compromisso</button> : <span />}<div className="flex gap-2"><button type="button" className={btnSecondary} onClick={onClose}>Voltar</button><button type="submit" className={btnPrimary} disabled={pending}>Salvar</button></div></div>
      </form>
    </Modal>
  )
}

function SettingsModal({ data, pending, onClose, action, openModel, openException, openAbsence }: any) {
  const [s, setS] = useState(data.settings)
  const change = (key: string, value: any) => setS((prev: any) => ({ ...prev, [key]: value }))
  const save = () => action(() => saveAttendanceSettings(s), onClose)
  return (
    <Modal title="Configurações do Atendimento" onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-3"><button className={btnSecondary} onClick={openModel}><Users className="h-4 w-4" />Equipe e rodízio</button><button className={btnSecondary} onClick={openException}><CalendarDays className="h-4 w-4" />Feriado / dia fechado</button><button className={btnSecondary} onClick={openAbsence}><UserRound className="h-4 w-4" />Registrar ausência</button></div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-semibold">Sala de matrícula</h3><div className="mt-3 grid grid-cols-2 gap-3"><TimeField label="Abertura" value={s.weekdayRoomOpen} onChange={(v) => change("weekdayRoomOpen", v)} /><TimeField label="Fechamento" value={s.weekdayRoomClose} onChange={(v) => change("weekdayRoomClose", v)} /><TimeField label="Turno 9h início" value={s.roomEarlyStart} onChange={(v) => change("roomEarlyStart", v)} /><TimeField label="Turno 9h fim" value={s.roomEarlyEnd} onChange={(v) => change("roomEarlyEnd", v)} /><TimeField label="Turno 11h início" value={s.roomLateStart} onChange={(v) => change("roomLateStart", v)} /><TimeField label="Turno 11h fim" value={s.roomLateEnd} onChange={(v) => change("roomLateEnd", v)} /><TimeField label="Sábado início" value={s.saturdayStart} onChange={(v) => change("saturdayStart", v)} /><TimeField label="Sábado fim" value={s.saturdayEnd} onChange={(v) => change("saturdayEnd", v)} /></div><div className="mt-3"><label className={labelCls}>Local</label><input className={inputCls} value={s.roomLocation} onChange={(e) => change("roomLocation", e.target.value)} /></div></section>
        <section className="rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-semibold">Conversão e externa</h3><div className="mt-3 grid grid-cols-2 gap-3"><TimeField label="Manhã início" value={s.morningStart} onChange={(v) => change("morningStart", v)} /><TimeField label="Manhã fim" value={s.morningEnd} onChange={(v) => change("morningEnd", v)} /><TimeField label="Tarde início" value={s.afternoonStart} onChange={(v) => change("afternoonStart", v)} /><TimeField label="Tarde fim" value={s.afternoonEnd} onChange={(v) => change("afternoonEnd", v)} /></div><div className="mt-3 grid gap-3"><div><label className={labelCls}>Local conversão</label><input className={inputCls} value={s.conversionLocation} onChange={(e) => change("conversionLocation", e.target.value)} /></div><div><label className={labelCls}>Local externa</label><input className={inputCls} value={s.externalLocation} onChange={(e) => change("externalLocation", e.target.value)} /></div></div></section>
      </div>
      <section className="mt-4 rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-semibold">Intervalos escalonados da sala</h3><p className="mt-1 text-xs text-slate-500">O cálculo de cobertura desconta estes intervalos e exige no mínimo {s.minRoomCoverage} pessoas disponíveis.</p><div className="mt-3 grid gap-3 sm:grid-cols-4">{[0,1].map((idx) => <div key={`e-${idx}`} className="rounded-lg bg-slate-50 p-2"><p className="mb-2 text-[11px] font-semibold text-slate-600">9h–18h · pessoa {idx + 1}</p><div className="grid grid-cols-2 gap-2"><TimeField label="Início" value={s.roomEarlyBreaks[idx]?.start || ""} onChange={(v) => { const arr=[...s.roomEarlyBreaks]; arr[idx]={ position:idx+1,start:v,end:arr[idx]?.end||"" }; change("roomEarlyBreaks",arr) }} /><TimeField label="Fim" value={s.roomEarlyBreaks[idx]?.end || ""} onChange={(v) => { const arr=[...s.roomEarlyBreaks]; arr[idx]={ position:idx+1,start:arr[idx]?.start||"",end:v }; change("roomEarlyBreaks",arr) }} /></div></div>)}{[0,1].map((idx) => <div key={`l-${idx}`} className="rounded-lg bg-slate-50 p-2"><p className="mb-2 text-[11px] font-semibold text-slate-600">11h–20h · pessoa {idx + 1}</p><div className="grid grid-cols-2 gap-2"><TimeField label="Início" value={s.roomLateBreaks[idx]?.start || ""} onChange={(v) => { const arr=[...s.roomLateBreaks]; arr[idx]={ position:idx+1,start:v,end:arr[idx]?.end||"" }; change("roomLateBreaks",arr) }} /><TimeField label="Fim" value={s.roomLateBreaks[idx]?.end || ""} onChange={(v) => { const arr=[...s.roomLateBreaks]; arr[idx]={ position:idx+1,start:arr[idx]?.start||"",end:v }; change("roomLateBreaks",arr) }} /></div></div>)}</div></section>
      <div className="mt-4 flex justify-end gap-2"><button className={btnSecondary} onClick={onClose}>Cancelar</button><button className={btnPrimary} disabled={pending} onClick={save}>Salvar configurações</button></div>
    </Modal>
  )
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) { return <div><label className={labelCls}>{label}</label><input type="time" className={inputCls} value={value || ""} onChange={(e) => onChange(e.target.value)} /></div> }

function ModelModal({ data, pending, onClose, action }: any) {
  const lanes: AttendanceLane[] = ["room_early","room_late","conversion_am_external_pm","external_am_conversion_pm","saturday"]
  const entry = (week: number, lane: AttendanceLane, position: number) => data.rotation.find((r: any) => r.weekIndex === week && r.lane === lane && r.position === position)
  return (
    <Modal title="Equipe e modelo de rodízio" onClose={onClose} wide>
      <p className="text-xs text-slate-500">Vincule as oito posições de referência a usuários reais. Consultor 7 e Consultor 8 não recebem convites enquanto estiverem sem vínculo.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{data.slots.map((slot: any) => <label key={slot.slotKey} className="rounded-xl border border-slate-200 p-3"><span className="mb-1 block text-xs font-semibold text-slate-700">{slot.label}</span><select className={inputCls} defaultValue={slot.userId || ""} onChange={(e) => action(() => updateTeamSlot(slot.slotKey, e.target.value || null))}><option value="">Sem vínculo</option>{data.members.filter((m: any) => m.attendanceEnabled).map((m: any) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</select></label>)}</div>
      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[1000px] text-xs"><thead className="bg-slate-50"><tr><th className="px-3 py-2 text-left">Semana</th>{lanes.map((lane) => <th key={lane} className="px-3 py-2 text-left">{LANE_LABEL[lane]}</th>)}</tr></thead><tbody>{[1,2,3,4].map((week) => <tr key={week} className="border-t border-slate-100 align-top"><td className="px-3 py-3 font-semibold">Semana {week}</td>{lanes.map((lane) => <td key={lane} className="px-2 py-2"><div className="space-y-1.5">{([1,2] as const).map((pos) => <select key={pos} className={`${inputCls} h-9`} defaultValue={entry(week,lane,pos)?.slotKey || ""} disabled={pending} onChange={(e) => action(() => updateRotationEntry({ weekIndex: week, lane, position: pos, slotKey: e.target.value }))}>{data.slots.map((s: any) => <option key={s.slotKey} value={s.slotKey}>{pos}. {s.label}</option>)}</select>)}</div></td>)}</tr>)}</tbody></table></div>
      <div className="mt-4 flex justify-end"><button className={btnSecondary} onClick={onClose}>Voltar</button></div>
    </Modal>
  )
}

function ExceptionModal({ pending, onClose, action }: any) {
  const [date, setDate] = useState("")
  const [note, setNote] = useState("")
  return <Modal title="Feriado ou dia sem funcionamento" onClose={onClose}><div className="space-y-3"><div><label className={labelCls}>Data</label><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></div><div><label className={labelCls}>Motivo</label><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: feriado municipal" /></div><p className="text-xs text-slate-500">Dias marcados como fechados são ignorados pela geração automática.</p><div className="flex justify-end gap-2"><button className={btnSecondary} onClick={onClose}>Cancelar</button><button className={btnPrimary} disabled={pending || !date} onClick={() => action(() => saveAttendanceException({ date, closed:true, kind:"holiday", note }), onClose)}>Salvar</button></div></div></Modal>
}

function AbsenceModal({ data, pending, onClose, action }: any) {
  const [userId, setUserId] = useState("")
  const [date, setDate] = useState("")
  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")
  const [reason, setReason] = useState("")
  return <Modal title="Registrar ausência" onClose={onClose}><div className="space-y-3"><div><label className={labelCls}>Consultor</label><select className={inputCls} value={userId} onChange={(e) => setUserId(e.target.value)}><option value="">Selecione</option>{data.members.filter((m:any)=>m.attendanceEnabled).map((m:any)=><option key={m.id} value={m.id}>{m.full_name}</option>)}</select></div><div><label className={labelCls}>Data</label><input type="date" className={inputCls} value={date} onChange={(e)=>setDate(e.target.value)} /></div><div className="grid grid-cols-2 gap-3"><TimeField label="Início (opcional)" value={startTime} onChange={setStartTime} /><TimeField label="Fim (opcional)" value={endTime} onChange={setEndTime} /></div><div><label className={labelCls}>Motivo</label><input className={inputCls} value={reason} onChange={(e)=>setReason(e.target.value)} /></div><p className="text-xs text-slate-500">Sem horário, a ausência vale para o dia inteiro e bloqueia a publicação da escala daquele consultor.</p><div className="flex justify-end gap-2"><button className={btnSecondary} onClick={onClose}>Cancelar</button><button className={btnPrimary} disabled={pending || !userId || !date} onClick={() => action(() => saveAbsence({ userId, date, startTime: startTime || undefined, endTime: endTime || undefined, reason }), onClose)}>Salvar</button></div></div></Modal>
}
