"use client"

import Link from "next/link"
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type FormEvent,
} from "react"
import { useRouter } from "next/navigation"
import {
  CalendarPlus,
  CheckCircle2,
  MessageSquarePlus,
  Plus,
  Users,
  X,
} from "lucide-react"
import { Card, Chip, PageHeader } from "@/components/high-school/hs-ui"
import {
  configureCaptureCycle,
  saveSchoolCapture,
  saveSchoolGrades,
} from "@/app/actions/school-capture"
import {
  CAPTURE_STATES,
  CAPTURE_METRICS,
  EMPTY_CAPTURE_FILTERS,
  selectedCaptureCycle,
  schoolCaptureSummaries,
  filterCaptureSummaries,
  captureTotals,
  actionHasResults,
  actionStartsAt,
  type CaptureData,
  type CaptureCycle,
  type CaptureFilters,
  type CaptureCommand,
  type SchoolCaptureSummary,
  type CampaignAudit,
} from "@/lib/school-capture/domain"
import {
  STATUS_ACAO_HS,
  TIPOS_ACAO_HS,
  CORES_STATUS_ACAO,
  CORES_CLASSIFICACAO_HS,
  type AcaoEscola,
} from "@/lib/domain/high-school"
import {
  actionTimestamp,
  localActionDateTime,
} from "@/lib/company-actions/domain"

const inputCls =
  "w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand/30"
const buttonCls =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
const primaryCls =
  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </span>
      {children}
    </label>
  )
}
function dateLabel(date: string) {
  return date ? date.slice(0, 10).split("-").reverse().join("/") : "—"
}
function instantLabel(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
function actionLabel(a: AcaoEscola) {
  return `${dateLabel(a.data)} · ${a.inicio?.slice(0, 5) || "Sem horário"}${a.fim ? `–${a.fim.slice(0, 5)}` : ""}`
}
function Dialog({
  title,
  description,
  children,
  onClose,
  busy = false,
  wide = false,
}: {
  title: string
  description?: string
  children: ReactNode
  onClose: () => void
  busy?: boolean
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const heading = useId()
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => dialog?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      aria-labelledby={heading}
      onCancel={(event) => {
        event.preventDefault()
        event.stopPropagation()
        if (!busy) onClose()
      }}
      className={`m-auto max-h-[90dvh] w-[calc(100%-1.5rem)] ${wide ? "max-w-5xl" : "max-w-2xl"} overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-950/60`}
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-white px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2
            id={heading}
            className="break-words text-base font-semibold text-slate-900"
          >
            {title}
          </h2>
          {description && (
            <p className="mt-1 break-words text-xs text-slate-500">
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label={`Fechar ${title}`}
          onClick={onClose}
          disabled={busy}
          className="shrink-0 rounded p-1.5 text-slate-500 hover:bg-slate-100"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      {children}
    </dialog>
  )
}
type Actor = { id: string; name: string; role: string }
type ModalState = {
  kind:
    | "start"
    | "contact"
    | "action"
    | "performed"
    | "result"
    | "grades"
    | "associate"
  schoolId: string
  cycleId: string
  actionId?: string
}
type Props = {
  data: CaptureData
  actor: Actor
  canWrite: boolean
  canConfigure: boolean
  initialCycleId?: string
  initialSchoolId?: string
  now: string
  compact?: boolean
}

export function SchoolCapture({
  data,
  actor,
  canWrite,
  canConfigure,
  initialCycleId,
  initialSchoolId,
  now,
  compact = false,
}: Props) {
  const router = useRouter()
  const initial = selectedCaptureCycle(data.cycles, initialCycleId)
  const [cycleId, setCycleId] = useState(initial?.id ?? "")
  const cycle = selectedCaptureCycle(data.cycles, cycleId)
  const [filters, setFilters] = useState<CaptureFilters>({
    ...EMPTY_CAPTURE_FILTERS,
  })
  const [detailId, setDetailId] = useState(
    initialSchoolId ?? (compact ? (data.schools[0]?.id ?? "") : ""),
  )
  const [historyCycle, setHistoryCycle] = useState(initial?.id ?? "all")
  const [modal, setModal] = useState<ModalState | null>(null)
  const [configuration, setConfiguration] = useState(false)
  const [message, setMessage] = useState("")
  const [pending, startTransition] = useTransition()
  const managerial = ["gerente", "supervisor"].includes(actor.role)
  const institutionalWriter = ["gerente", "supervisor", "high_school"].includes(
    actor.role,
  )
  const summaries = useMemo(
    () => (cycle ? schoolCaptureSummaries(data, cycle, now, filters) : []),
    [data, cycle, now, filters],
  )
  const baseRows = filterCaptureSummaries(summaries, filters, false)
  const rows = filterCaptureSummaries(summaries, filters)
  const totals = captureTotals(rows)
  const official = cycle
    ? data.officialSnapshots
        .filter((s) => s.cycle_id === cycle.id)
        .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))[0]
    : undefined
  const school = data.schools.find((s) => s.id === detailId)
  const updateFilter = (patch: Partial<CaptureFilters>) =>
    setFilters((current) => ({ ...current, ...patch }))
  const open = (
    kind: ModalState["kind"],
    schoolId: string,
    actionId?: string,
    targetCycle = cycle?.id,
  ) => {
    if (targetCycle) {
      setMessage("")
      setModal({ kind, schoolId, actionId, cycleId: targetCycle })
    }
  }
  const openDetail = (id: string) => {
    setDetailId(id)
    setHistoryCycle(cycle?.id ?? "all")
  }
  const refresh = (text: string) => {
    setMessage(text)
    setModal(null)
    router.refresh()
  }
  function closeEngagement(id: string, schoolId: string, targetCycle: string) {
    startTransition(async () => {
      const result = await saveSchoolCapture({
        schoolId,
        cycleId: targetCycle,
        command: "close",
        payload: { id },
      })
      setMessage(result.message)
      if (result.ok) router.refresh()
    })
  }
  const options = (values: (string | undefined)[]) =>
    [...new Set(values.filter((v): v is string => Boolean(v)))].sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    )
  const toolbar = (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1 sm:max-w-sm">
        <Field
          label={compact ? "Histórico por edição" : "Edição do SuperVestibular"}
        >
          <select
            className={inputCls}
            value={compact ? historyCycle : (cycle?.id ?? "")}
            onChange={(event) => {
              if (compact) {
                setHistoryCycle(event.target.value)
                if (event.target.value !== "all") setCycleId(event.target.value)
              } else {
                setCycleId(event.target.value)
                setFilters({ ...EMPTY_CAPTURE_FILTERS })
                setHistoryCycle(event.target.value)
              }
            }}
          >
            {compact && (
              <option value="all">
                Histórico consolidado — todas as edições
              </option>
            )}
            {!data.cycles.length && (
              <option value="">Nenhuma edição cadastrada</option>
            )}
            {data.cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.is_active ? " · Ativa" : ""}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {cycle && canConfigure && (
        <button
          className={buttonCls}
          type="button"
          onClick={() => setConfiguration(true)}
        >
          Configurar edição
        </button>
      )}
      {canConfigure && (
        <Link className={buttonCls} href="/supervest">
          Cadastrar / gerenciar edições
        </Link>
      )}
    </div>
  )
  function actionButtons(id: string) {
    return canWrite && cycle ? (
      <div className="flex flex-wrap gap-2">
        <button className={buttonCls} onClick={() => open("start", id)}>
          <Users className="h-3.5 w-3.5" />
          Iniciar atuação
        </button>
        <button className={buttonCls} onClick={() => open("contact", id)}>
          <MessageSquarePlus className="h-3.5 w-3.5" />
          Registrar contato
        </button>
        <button className={buttonCls} onClick={() => open("action", id)}>
          <CalendarPlus className="h-3.5 w-3.5" />
          Agendar divulgação
        </button>
        <button className={buttonCls} onClick={() => open("performed", id)}>
          <CheckCircle2 className="h-3.5 w-3.5" />
          Registrar ação realizada
        </button>
      </div>
    ) : null
  }
  function who(row: SchoolCaptureSummary) {
    return row.engagements.length ? (
      <ul className="space-y-2">
        {row.engagements.map((e) => (
          <li key={e.id}>
            <p className="font-medium text-slate-800">{e.user_name}</p>
            <p>
              {CAPTURE_STATES[e.status]} · {instantLabel(e.updated_at)}
            </p>
          </li>
        ))}
      </ul>
    ) : (
      <span className="text-slate-400">Sem atuação atual</span>
    )
  }
  function situation(row: SchoolCaptureSummary) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {row.scheduled.length > 0 && (
          <Chip className="border-sky-200 bg-sky-50 text-sky-800">
            {row.scheduled.length} agendada(s)/confirmada(s)
          </Chip>
        )}
        {row.performed.length > 0 && (
          <Chip className="border-emerald-200 bg-emerald-50 text-emerald-800">
            {row.performed.length} realizada(s)
          </Chip>
        )}
        {row.metrics.to_schedule && <Chip>Para agendar divulgação</Chip>}
        {row.contacts.length === 0 && <Chip>Sem contato no ciclo</Chip>}
      </div>
    )
  }
  function results(row: SchoolCaptureSummary) {
    return (
      <div className="space-y-1">
        <p>
          {row.leads} leads · {row.pendingRegistrations} inscrições a lançar ·{" "}
          {row.registrations} lançadas/conferidas
        </p>
        {row.impacted !== null && <p>{row.impacted} alunos impactados</p>}
        {row.pendingResults.length > 0 && (
          <p className="font-medium text-amber-800">
            {row.pendingResults.length} ação(ões) com resultado pendente
          </p>
        )}
        {row.alerts.map((a) => (
          <p key={a} className="text-amber-800">
            {a}
          </p>
        ))}
      </div>
    )
  }
  function nextSteps(row: SchoolCaptureSummary) {
    return row.nextSteps.length ? (
      <ul className="space-y-2">
        {row.nextSteps.map((c) => (
          <li key={c.id}>
            <p>{c.next_step}</p>
            <p
              className={
                c.return_at && c.return_at < now
                  ? "text-rose-700"
                  : "text-slate-400"
              }
            >
              {c.consultant_name}
              {c.return_at ? ` · ${instantLabel(c.return_at)}` : " · Sem prazo"}
            </p>
          </li>
        ))}
      </ul>
    ) : (
      <span className="text-slate-400">Sem próximo passo</span>
    )
  }
  function editionTag(id: string | null | undefined) {
    return (
      <Chip>
        {data.cycles.find((c) => c.id === id)?.name ?? "Sem edição vinculada"}
      </Chip>
    )
  }
  function renderHistory(targetSchoolId: string) {
    const match = (id: string | null | undefined) =>
      historyCycle === "all" || id === historyCycle
    const contacts = data.contacts.filter(
      (c) => c.school_id === targetSchoolId && match(c.supervest_cycle_id),
    )
    const engagements = data.engagements.filter(
      (e) => e.school_id === targetSchoolId && match(e.supervest_cycle_id),
    )
    const actions = data.actions.filter(
      (a) => a.escolaId === targetSchoolId && match(a.supervestCicloId),
    )
    const active = engagements.filter((e) => !e.ended_at)
    const entries = [
      ...contacts.map((c) => ({
        kind: "contact" as const,
        date: c.occurred_at,
        id: c.id,
        contact: c,
      })),
      ...engagements.map((e) => ({
        kind: "engagement" as const,
        date: e.updated_at,
        id: e.id,
        engagement: e,
      })),
      ...actions.map((a) => ({
        kind: "action" as const,
        date: actionStartsAt(a),
        id: a.id,
        action: a,
      })),
    ].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    const audit = data.history
      .filter(
        (h) =>
          h.school_id === targetSchoolId &&
          (historyCycle === "all" || h.supervest_cycle_id === historyCycle),
      )
      .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))
    return (
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Quem está atuando
          </p>
          {active.length ? (
            <ul className="space-y-2">
              {active.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {e.user_name} — {CAPTURE_STATES[e.status]}
                    </p>
                    <p className="text-xs text-slate-500">
                      {
                        data.cycles.find((c) => c.id === e.supervest_cycle_id)
                          ?.name
                      }{" "}
                      · Última movimentação {instantLabel(e.updated_at)}
                    </p>
                  </div>
                  {canWrite &&
                    (managerial ||
                      e.user_id === actor.id ||
                      e.created_by === actor.id) && (
                      <button
                        disabled={pending}
                        className={buttonCls}
                        onClick={() =>
                          closeEngagement(
                            e.id,
                            targetSchoolId,
                            e.supervest_cycle_id,
                          )
                        }
                      >
                        Encerrar atuação de {e.user_name}
                      </button>
                    )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">
              Sem atuação atual nesta seleção.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h3 className="text-sm font-semibold">Histórico da captação</h3>
          {!compact && (
            <Field label="Histórico por edição">
              <select
                className={inputCls}
                value={historyCycle}
                onChange={(e) => setHistoryCycle(e.target.value)}
              >
                <option value="all">Consolidado — todas as edições</option>
                {data.cycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        {!entries.length && (
          <p className="rounded-lg border border-dashed p-5 text-center text-sm text-slate-500">
            Sem registros nesta edição. A escola continua disponível para
            atuação.
          </p>
        )}
        <ol className="space-y-3">
          {entries.map((entry) => (
            <li
              key={`${entry.kind}-${entry.id}`}
              className="break-words rounded-xl border border-slate-200 p-4"
            >
              {entry.kind === "contact" && (
                <>
                  <div className="flex flex-wrap justify-between gap-2">
                    <p className="text-sm font-semibold">
                      Contato · {entry.contact.channel}
                    </p>
                    {editionTag(entry.contact.supervest_cycle_id)}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {instantLabel(entry.date)} · {entry.contact.consultant_name}
                  </p>
                  <p className="mt-2 text-sm">
                    {entry.contact.person_name}
                    {entry.contact.person_role
                      ? ` · ${entry.contact.person_role}`
                      : ""}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                    {entry.contact.description}
                  </p>
                  {entry.contact.response && (
                    <p className="mt-2 text-sm">
                      <strong>Resposta:</strong> {entry.contact.response}
                    </p>
                  )}
                  <p className="mt-2 text-xs">
                    {CAPTURE_STATES[entry.contact.negotiation_status]}
                  </p>
                  {entry.contact.next_step && (
                    <p className="mt-1 text-sm">
                      <strong>Próximo passo:</strong> {entry.contact.next_step}
                      {entry.contact.return_at
                        ? ` · ${instantLabel(entry.contact.return_at)}`
                        : ""}
                    </p>
                  )}
                </>
              )}
              {entry.kind === "engagement" && (
                <>
                  <div className="flex flex-wrap justify-between gap-2">
                    <p className="text-sm font-semibold">
                      Atuação de {entry.engagement.user_name}
                    </p>
                    {editionTag(entry.engagement.supervest_cycle_id)}
                  </div>
                  <p className="mt-1 text-sm">
                    {CAPTURE_STATES[entry.engagement.status]}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Iniciada em {instantLabel(entry.engagement.started_at)}
                    {entry.engagement.ended_at
                      ? ` · Encerrada em ${instantLabel(entry.engagement.ended_at)}`
                      : ` · Última movimentação ${instantLabel(entry.engagement.updated_at)}`}
                  </p>
                </>
              )}
              {entry.kind === "action" && (
                <>
                  <div className="flex flex-wrap justify-between gap-2">
                    <p className="text-sm font-semibold">{entry.action.tipo}</p>
                    <div className="flex flex-wrap gap-2">
                      {editionTag(entry.action.supervestCicloId)}
                      <Chip className={CORES_STATUS_ACAO[entry.action.status]}>
                        {entry.action.status}
                      </Chip>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {actionLabel(entry.action)} · Principal:{" "}
                    {entry.action.consultorPrincipalNome ??
                      data.owners.find(
                        (o) => o.id === entry.action.primaryOwnerId,
                      )?.nome ??
                      "Usuário do histórico"}
                  </p>
                  {entry.action.participantes.length > 0 && (
                    <p className="mt-1 text-xs text-slate-500">
                      Apoio:{" "}
                      {entry.action.participantes.map((p) => p.nome).join(", ")}
                    </p>
                  )}
                  <p className="mt-2 text-sm">{entry.action.objetivo}</p>
                  {entry.action.local && (
                    <p className="mt-1 text-sm">Local: {entry.action.local}</p>
                  )}
                  {entry.action.contatoId && (
                    <p className="mt-1 text-sm">
                      Contato:{" "}
                      {data.institutionalContacts.find(
                        (c) => c.id === entry.action.contatoId,
                      )?.nome ?? "Contato institucional"}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-slate-500">
                    Séries:{" "}
                    {(entry.action.seriesAlvo ?? [])
                      .map(
                        (code) =>
                          data.grades.find((g) => g.code === code)?.label ??
                          code,
                      )
                      .join(", ") || "Não informadas"}
                    {entry.action.turmasDescricao
                      ? ` · Turmas: ${entry.action.turmasDescricao}`
                      : ""}
                    {entry.action.estimativaAlunos != null
                      ? ` · Estimativa: ${entry.action.estimativaAlunos} alunos`
                      : ""}
                  </p>
                  {entry.action.observacoes && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                      {entry.action.observacoes}
                    </p>
                  )}
                  {entry.action.status === "realizada" &&
                    (actionHasResults(entry.action) ? (
                      <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900">
                        <p className="font-semibold">
                          Resultado informado
                          {entry.action.resultadoInformadoEm
                            ? ` · ${instantLabel(entry.action.resultadoInformadoEm)}`
                            : ""}
                        </p>
                        {entry.action.resultados.map((r) => (
                          <p className="mt-1" key={r.serie}>
                            {data.grades.find((g) => g.code === r.serie)
                              ?.label ?? r.serie}
                            :{" "}
                            {r.impactados != null
                              ? `${r.impactados} impactados · `
                              : ""}
                            {r.leads} leads · {r.inscricoesPendentes ?? 0}{" "}
                            inscrições a lançar · {r.inscricoesSupervest}{" "}
                            lançadas/conferidas
                          </p>
                        ))}
                        {entry.action.resultadoObs && (
                          <p className="mt-2 whitespace-pre-wrap">
                            {entry.action.resultadoObs}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                        Resultado pendente de preenchimento. Nenhuma quantidade
                        foi presumida.
                      </p>
                    ))}
                  {canWrite &&
                    entry.action.supervestCicloId &&
                    (managerial ||
                      institutionalWriter ||
                      entry.action.createdBy === actor.id ||
                      entry.action.primaryOwnerId === actor.id ||
                      entry.action.participantes.some(
                        (p) => p.userId === actor.id,
                      )) && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className={buttonCls}
                          onClick={() =>
                            open(
                              "action",
                              targetSchoolId,
                              entry.action.id,
                              entry.action.supervestCicloId ?? undefined,
                            )
                          }
                        >
                          Editar / cancelar / reagendar
                        </button>
                        {entry.action.status === "realizada" ? (
                          <button
                            className={buttonCls}
                            onClick={() =>
                              open(
                                "result",
                                targetSchoolId,
                                entry.action.id,
                                entry.action.supervestCicloId ?? undefined,
                              )
                            }
                          >
                            Registrar resultado
                          </button>
                        ) : (
                          entry.action.status !== "cancelada" && (
                            <button
                              className={buttonCls}
                              onClick={() =>
                                open(
                                  "performed",
                                  targetSchoolId,
                                  entry.action.id,
                                  entry.action.supervestCicloId ?? undefined,
                                )
                              }
                            >
                              Registrar realização
                            </button>
                          )
                        )}
                      </div>
                    )}
                  {!entry.action.supervestCicloId && managerial && cycle && (
                    <button
                      className={`${buttonCls} mt-3`}
                      onClick={() =>
                        open("associate", targetSchoolId, entry.action.id)
                      }
                    >
                      Associar à edição correta
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
        {audit.length > 0 && (
          <details className="rounded-lg border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Alterações e autoria ({audit.length})
            </summary>
            <ol className="mt-3 space-y-3">
              {audit.map((h) => (
                <li
                  key={h.id}
                  className="border-l-2 border-slate-200 pl-3 text-xs"
                >
                  <p className="font-medium">{auditLabel(h)}</p>
                  <p className="mt-1 text-slate-500">
                    {h.actor_name} · {instantLabel(h.recorded_at)} ·{" "}
                    {data.cycles.find((c) => c.id === h.supervest_cycle_id)
                      ?.name ?? "Sem edição / cadastro institucional"}
                  </p>
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
    )
  }
  const legacy = data.actions.filter((a) => !a.supervestCicloId)
  return (
    <div className="min-w-0 space-y-5">
      {!compact && (
        <PageHeader
          titulo="Captação Escolas"
          descricao="Carteira compartilhada para divulgar cada edição do SuperVestibular."
          acao={
            <Link href="/high-school/agenda" className={buttonCls}>
              Agenda High School
            </Link>
          }
        />
      )}
      <Card className="space-y-3 p-4">
        {compact && (
          <h2 className="text-base font-semibold">
            Captação e histórico por edição
          </h2>
        )}
        {toolbar}
        {cycle && (
          <p className="text-xs text-slate-500">
            {cycle.name} · Ano letivo da divulgação:{" "}
            {cycle.capture_academic_year ?? "não configurado"} · Período:{" "}
            {cycle.campaign_start_at
              ? dateLabel(cycle.campaign_start_at)
              : "sem início definido"}{" "}
            a{" "}
            {cycle.campaign_end_at
              ? dateLabel(cycle.campaign_end_at)
              : "sem fim definido"}{" "}
            · Fuso de São Paulo
          </p>
        )}
        {cycle && !cycle.capture_academic_year && (
          <p className="text-xs text-amber-800">
            Configure o ano letivo da divulgação. O ano da edição pode ser
            diferente.
          </p>
        )}
        {compact && data.schools[0] && actionButtons(data.schools[0].id)}
      </Card>
      {message && (
        <p
          role="status"
          className="rounded-lg border border-brand/20 bg-brand/5 px-4 py-3 text-sm"
        >
          {message}
        </p>
      )}
      {!compact && cycle && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {CAPTURE_METRICS.map((metric) => (
              <button
                key={metric.key}
                aria-pressed={filters.situation === metric.key}
                className={`min-w-0 rounded-xl border bg-white p-3 text-left transition hover:border-brand/50 ${filters.situation === metric.key ? "border-brand ring-1 ring-brand/20" : "border-slate-200"}`}
                onClick={() =>
                  updateFilter({
                    situation:
                      filters.situation === metric.key ? "all" : metric.key,
                  })
                }
              >
                <p className="text-xs text-slate-500">{metric.label}</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                  {baseRows.filter((r) => r.metrics[metric.key]).length}
                </p>
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Indicadores acima contam escolas, uma vez por escola.{" "}
            {baseRows.filter((r) => r.eligibility === "unknown").length}{" "}
            escola(s) aguardam confirmação de séries e permanecem no
            levantamento.
          </p>
          <Card className="p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <Field label="Nome da escola">
                <input
                  className={inputCls}
                  value={filters.name}
                  onChange={(e) => updateFilter({ name: e.target.value })}
                  placeholder="Buscar escola"
                />
              </Field>
              <Field label="Cidade">
                <select
                  className={inputCls}
                  value={filters.city}
                  onChange={(e) => updateFilter({ city: e.target.value })}
                >
                  <option value="">Todas</option>
                  {options(data.schools.map((s) => s.cidade)).map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field label="Rede de ensino">
                <select
                  className={inputCls}
                  value={filters.network}
                  onChange={(e) => updateFilter({ network: e.target.value })}
                >
                  <option value="">Todas</option>
                  {options(data.schools.map((s) => s.rede)).map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field label="Classificação">
                <select
                  className={inputCls}
                  value={filters.classification}
                  onChange={(e) =>
                    updateFilter({ classification: e.target.value })
                  }
                >
                  <option value="">Todas</option>
                  {options(data.schools.map((s) => s.classificacao)).map(
                    (v) => (
                      <option key={v}>{v}</option>
                    ),
                  )}
                </select>
              </Field>
              <Field label="Etapa do relacionamento">
                <select
                  className={inputCls}
                  value={filters.stage}
                  onChange={(e) => updateFilter({ stage: e.target.value })}
                >
                  <option value="">Todas</option>
                  {options([
                    "Mapeada",
                    ...data.schools.map((s) => s.etapa),
                  ]).map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field label="Situação da captação">
                <select
                  className={inputCls}
                  value={filters.situation}
                  onChange={(e) =>
                    updateFilter({
                      situation: e.target.value as CaptureFilters["situation"],
                    })
                  }
                >
                  <option value="all">Todas</option>
                  {CAPTURE_METRICS.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Consultor em atuação ou participante">
                <select
                  className={inputCls}
                  value={filters.consultant}
                  onChange={(e) => updateFilter({ consultant: e.target.value })}
                >
                  <option value="">Todos</option>
                  {data.owners
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nome}
                        {o.active === false ? " · Inativo (histórico)" : ""}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Movimentações a partir de">
                <input
                  type="date"
                  className={inputCls}
                  value={filters.from}
                  onChange={(e) => updateFilter({ from: e.target.value })}
                />
              </Field>
              <Field label="Movimentações até">
                <input
                  type="date"
                  className={inputCls}
                  value={filters.to}
                  onChange={(e) => updateFilter({ to: e.target.value })}
                />
              </Field>
              <button
                className={`${buttonCls} self-end`}
                onClick={() => setFilters({ ...EMPTY_CAPTURE_FILTERS })}
              >
                Limpar filtros / Todas
              </button>
            </div>
          </Card>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs text-slate-500">Ações nesta seleção</p>
              <p className="mt-1 text-xl font-semibold">{totals.actions}</p>
              <p className="text-xs text-slate-500">
                {totals.scheduled} agendadas/confirmadas · {totals.performed}{" "}
                realizadas
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-slate-500">
                Leads das ações realizadas
              </p>
              <p className="mt-1 text-xl font-semibold">{totals.leads}</p>
              <p className="text-xs text-slate-500">
                Cada ação contada uma única vez
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-slate-500">
                Inscrições atribuídas às ações
              </p>
              <p className="mt-1 text-xl font-semibold">
                {totals.registrations}
              </p>
              <p className="text-xs text-slate-500">
                {totals.pending} aguardam lançamento · {totals.pendingResults}{" "}
                resultados pendentes
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-slate-500">Total oficial da edição</p>
              <p className="mt-1 text-xl font-semibold">
                {official ? official.official_registrations : "Não informado"}
              </p>
              <p className="text-xs text-slate-500">
                {official
                  ? `Leitura de ${dateLabel(official.snapshot_date)}`
                  : "Fonte: registros oficiais do SuperVest"}{" "}
                · Não é somado às atribuições
              </p>
            </Card>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {rows.length} escola(s) · {cycle.name}
            </p>
            <p className="text-xs text-slate-500">
              A atuação não reserva a escola.
            </p>
          </div>
          <div className="space-y-3 lg:hidden">
            {rows.map((row) => (
              <Card key={row.school.id} className="space-y-3 p-4">
                <div>
                  <button
                    onClick={() => openDetail(row.school.id)}
                    className="break-words text-left text-sm font-semibold text-brand hover:underline"
                  >
                    {row.school.nome}
                  </button>
                  <p className="mt-1 text-xs text-slate-500">
                    {row.school.cidade} · {row.school.rede} · {row.school.etapa}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {row.school.classificacao && (
                      <Chip
                        className={
                          CORES_CLASSIFICACAO_HS[row.school.classificacao]
                        }
                      >
                        {row.school.classificacao}
                      </Chip>
                    )}
                    <Chip>
                      {row.eligibility === "eligible"
                        ? "3º ano confirmado"
                        : row.eligibility === "unknown"
                          ? "Confirmar séries"
                          : "Elegibilidade alterada · histórico"}
                    </Chip>
                  </div>
                </div>
                {situation(row)}
                <div className="text-xs text-slate-600">
                  <p className="mb-1 font-semibold">Quem está atuando</p>
                  {who(row)}
                </div>
                <div className="text-xs text-slate-600">
                  <p className="mb-1 font-semibold">Último contato do ciclo</p>
                  {row.lastContact
                    ? `${instantLabel(row.lastContact.occurred_at)} · ${row.lastContact.consultant_name}`
                    : "Sem contato"}
                </div>
                <div className="text-xs text-slate-600">
                  <p className="mb-1 font-semibold">Próximo passo e prazo</p>
                  {nextSteps(row)}
                </div>
                <div className="text-xs text-slate-600">
                  <p className="mb-1 font-semibold">Próxima divulgação</p>
                  {row.nextAction
                    ? `${actionLabel(row.nextAction)} · ${row.nextAction.tipo}`
                    : "Nenhuma divulgação válida agendada"}
                </div>
                <div className="text-xs text-slate-600">{results(row)}</div>
                <button
                  className={buttonCls}
                  onClick={() => openDetail(row.school.id)}
                >
                  Ver histórico / registrar
                </button>
              </Card>
            ))}
          </div>
          <Card className="hidden lg:block">
            <div
              className="uni-scroll-region max-h-[75vh] overflow-auto"
              tabIndex={0}
              role="region"
              aria-label="Escolas e acompanhamento da captação"
            >
              <table
                data-capture-table
                className="w-full min-w-[1735px] table-fixed text-left text-xs"
              >
                <colgroup>
                  {[230, 150, 220, 180, 180, 210, 185, 240, 140].map(
                    (width, index) => (
                      <col key={index} style={{ width }} />
                    ),
                  )}
                </colgroup>
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    {[
                      "Escola / cidade",
                      "Classificação / séries",
                      "Quem está atuando",
                      "Situação da captação",
                      "Último contato do ciclo",
                      "Próximo passo / prazo",
                      "Próxima divulgação",
                      "Resultados / pendências",
                      "",
                    ].map((label) => (
                      <th key={label} className="p-3 font-medium">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr
                      key={row.school.id}
                      className="align-top text-slate-600"
                    >
                      <td className="w-48 p-3">
                        <button
                          onClick={() => openDetail(row.school.id)}
                          className="break-words text-left font-semibold text-brand hover:underline"
                        >
                          {row.school.nome}
                        </button>
                        <p className="mt-1">
                          {row.school.cidade} · {row.school.rede}
                        </p>
                        <p className="mt-1 text-slate-400">
                          {row.school.etapa}
                        </p>
                      </td>
                      <td className="w-36 p-3">
                        <div className="space-y-2">
                          {row.school.classificacao && (
                            <Chip
                              className={
                                CORES_CLASSIFICACAO_HS[row.school.classificacao]
                              }
                            >
                              {row.school.classificacao}
                            </Chip>
                          )}
                          <p>
                            {row.eligibility === "eligible"
                              ? "3º ano confirmado"
                              : row.eligibility === "unknown"
                                ? "Confirmar séries"
                                : "Elegibilidade alterada"}
                          </p>
                        </div>
                      </td>
                      <td className="w-56 p-3">{who(row)}</td>
                      <td className="w-40 p-3">{situation(row)}</td>
                      <td className="w-40 p-3">
                        {row.lastContact ? (
                          <>
                            <p>{instantLabel(row.lastContact.occurred_at)}</p>
                            <p className="mt-1">
                              {row.lastContact.consultant_name}
                            </p>
                          </>
                        ) : (
                          "Sem contato"
                        )}
                      </td>
                      <td className="w-48 p-3">{nextSteps(row)}</td>
                      <td className="w-40 p-3">
                        {row.nextAction ? (
                          <>
                            <p>{actionLabel(row.nextAction)}</p>
                            <p className="mt-1">
                              {row.nextAction.tipo} · {row.nextAction.status}
                            </p>
                          </>
                        ) : (
                          "Nenhuma divulgação válida"
                        )}
                      </td>
                      <td className="w-56 p-3">{results(row)}</td>
                      <td className="uni-table-actions sticky right-0 w-28 bg-white p-3 shadow-[-4px_0_8px_rgba(0,0,0,0.04)]">
                        <button
                          className={buttonCls}
                          onClick={() => openDetail(row.school.id)}
                        >
                          Ver / registrar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          {!rows.length && (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">
              Nenhuma escola para estes filtros. Limpe os filtros para voltar ao
              levantamento.
            </p>
          )}
          {legacy.length > 0 && (
            <Card className="space-y-3 p-4">
              <h2 className="text-sm font-semibold">
                Ações antigas sem edição vinculada ({legacy.length})
              </h2>
              <p className="text-xs text-slate-500">
                Preservadas fora dos indicadores. A gestão pode associar a
                edição correta, sem deduzir o vínculo pelo ano da data.
              </p>
              {legacy.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"
                >
                  <p className="text-xs">
                    {a.escolaNome} · {a.tipo} · {actionLabel(a)}
                  </p>
                  <button
                    className={buttonCls}
                    onClick={() => {
                      setDetailId(a.escolaId)
                      setHistoryCycle("all")
                    }}
                  >
                    Consultar / associar
                  </button>
                </div>
              ))}
            </Card>
          )}
        </>
      )}
      {compact && school && (
        <Card className="p-4">{renderHistory(school.id)}</Card>
      )}
      {!compact && school && (
        <Dialog
          wide
          title={school.nome}
          description={`Carteira compartilhada · ${cycle?.name ?? "Escolha uma edição"}`}
          onClose={() => setDetailId("")}
        >
          <div className="space-y-5 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                {school.cidade} · {school.etapa} ·{" "}
                {school.seriesOferecidas?.includes("em3")
                  ? "3º ano confirmado"
                  : "Confirmar séries no cadastro"}
              </p>
              <div className="flex flex-wrap gap-2">
                {institutionalWriter && (
                  <button
                    className={buttonCls}
                    onClick={() => open("grades", school.id)}
                  >
                    Confirmar séries
                  </button>
                )}
                <Link
                  href={`/high-school/escolas/${school.id}`}
                  className={buttonCls}
                >
                  Abrir ficha institucional
                </Link>
              </div>
            </div>
            {actionButtons(school.id)}
            {renderHistory(school.id)}
          </div>
        </Dialog>
      )}
      {configuration && cycle && (
        <CycleConfiguration
          cycle={cycle}
          onClose={() => setConfiguration(false)}
          onSaved={(text) => {
            setConfiguration(false)
            setMessage(text)
            router.refresh()
          }}
        />
      )}
      {modal && (
        <CaptureForm
          key={`${modal.kind}-${modal.schoolId}-${modal.cycleId}-${modal.actionId ?? "new"}`}
          modal={modal}
          data={data}
          actor={actor}
          onClose={() => setModal(null)}
          onSaved={refresh}
        />
      )}
    </div>
  )
}

function auditLabel(h: CampaignAudit) {
  const names: Record<string, string> = {
    school_actions: "Ação",
    school_action_participants: "Participante da ação",
    school_action_grade_results: "Resultado por série",
    school_campaign_contacts: "Contato",
    school_campaign_engagements: "Atuação",
    schools: "Séries da escola",
  }
  let label = `${names[h.entity] ?? "Registro"} ${h.operation === "INSERT" ? "registrado" : h.operation === "DELETE" ? "removido do conjunto" : "atualizado"}`
  if (h.before_data && h.after_data) {
    if (h.before_data.status !== h.after_data.status)
      label += ` · ${String(h.before_data.status ?? "—")} → ${String(h.after_data.status ?? "—")}`
    if (h.before_data.action_date !== h.after_data.action_date)
      label += ` · ${dateLabel(String(h.before_data.action_date ?? ""))} → ${dateLabel(String(h.after_data.action_date ?? ""))}`
    if (
      h.before_data.supervest_cycle_id == null &&
      h.after_data.supervest_cycle_id
    )
      label += " · edição associada pela gestão"
  }
  return label
}

function CycleConfiguration({
  cycle,
  onClose,
  onSaved,
}: {
  cycle: CaptureCycle
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [error, setError] = useState("")
  const [pending, start] = useTransition()
  function submit(form: FormData) {
    start(async () => {
      const r = await configureCaptureCycle(form)
      if (r.ok) onSaved(r.message)
      else setError(r.message)
    })
  }
  return (
    <Dialog
      title="Configurar edição"
      description={cycle.name}
      onClose={onClose}
      busy={pending}
    >
      <form action={submit} className="space-y-4 p-4 sm:p-5">
        <input type="hidden" name="cycleId" value={cycle.id} />
        <Field label="Ano letivo da divulgação *">
          <input
            required
            type="number"
            min="1900"
            max="2200"
            name="academicYear"
            defaultValue={cycle.capture_academic_year ?? ""}
            className={inputCls}
          />
        </Field>
        <p className="text-xs text-slate-500">
          Este é o ano das turmas visitadas. Ele pode ser diferente do nome da
          edição.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Início da captação">
            <input
              type="date"
              name="start"
              defaultValue={cycle.campaign_start_at ?? ""}
              className={inputCls}
            />
          </Field>
          <Field label="Fim da captação">
            <input
              type="date"
              name="end"
              defaultValue={cycle.campaign_end_at ?? ""}
              className={inputCls}
            />
          </Field>
        </div>
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={cycle.is_active}
          />
          Abrir esta edição inicialmente na captação
        </label>
        {error && (
          <p role="alert" className="text-sm text-rose-700">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className={buttonCls}
          >
            Cancelar
          </button>
          <button disabled={pending} className={primaryCls}>
            {pending ? "Salvando…" : "Salvar configuração"}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function CaptureForm({
  modal,
  data,
  actor,
  onClose,
  onSaved,
}: {
  modal: ModalState
  data: CaptureData
  actor: Actor
  onClose: () => void
  onSaved: (text: string) => void
}) {
  const school = data.schools.find((s) => s.id === modal.schoolId)!
  const cycle = data.cycles.find((c) => c.id === modal.cycleId)!
  const action = data.actions.find((a) => a.id === modal.actionId)
  const current = localActionDateTime()
  const endMinutes = Math.min(
    23 * 60 + 59,
    Number(current.time.slice(0, 2)) * 60 + Number(current.time.slice(3)) + 60,
  )
  const initialEnd = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`
  const [error, setError] = useState("")
  const [pending, start] = useTransition()
  const saving = useRef(false)
  const [support, setSupport] = useState<string[]>(
    action?.participantes.map((p) => p.userId) ?? [],
  )
  const [selectedGrades, setSelectedGrades] = useState<string[]>(
    modal.kind === "grades"
      ? (school.seriesOferecidas ?? [])
      : action?.seriesAlvo?.length
        ? action.seriesAlvo
        : ["em3"],
  )
  const [personId, setPersonId] = useState(action?.contatoId ?? "")
  const contacts = data.institutionalContacts.filter(
    (c) => c.escolaId === school.id,
  )
  const [personName, setPersonName] = useState("")
  const [personRole, setPersonRole] = useState("")
  const [principal, setPrincipal] = useState(action?.primaryOwnerId ?? actor.id)
  const [resultGrades, setResultGrades] = useState([
    ...new Set([
      ...(action?.resultados.map((r) => r.serie) ?? []),
      ...(action?.seriesAlvo?.length ? action.seriesAlvo : ["em3"]),
    ]),
  ])
  const [id] = useState(() => crypto.randomUUID())
  const title = {
    start: "Iniciar atuação",
    contact: "Registrar contato",
    action: action ? "Editar ação" : "Agendar divulgação",
    performed: action ? "Registrar realização" : "Registrar ação realizada",
    result: "Registrar resultado",
    grades: "Confirmar séries",
    associate: "Associar ação antiga à edição",
  }[modal.kind]
  const isAction = modal.kind === "action" || modal.kind === "performed"
  const stateOptions = Object.entries(CAPTURE_STATES).filter(
    ([key]) => key !== "encerrada",
  )
  function choosePerson(value: string) {
    setPersonId(value)
    const contact = contacts.find((c) => c.id === value)
    if (contact) {
      setPersonName(contact.nome)
      setPersonRole(contact.papel ?? "")
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving.current) return
    setError("")
    const form = new FormData(event.currentTarget),
      get = (key: string) => String(form.get(key) ?? "")
    let command: CaptureCommand = "start",
      payload: Record<string, unknown> = {
        support_ids: support,
        status: get("negotiationStatus"),
      }
    try {
      if (modal.kind === "contact") {
        command = "contact"
        payload = {
          ...payload,
          id,
          contact_id: personId || null,
          person_name: personName,
          person_role: personRole,
          channel: get("channel"),
          description: get("description"),
          response: get("response"),
          occurred_at: actionTimestamp(get("date"), get("time")),
          next_step: get("nextStep"),
          return_at: get("returnDate")
            ? actionTimestamp(get("returnDate"), get("returnTime") || "09:00")
            : null,
        }
      } else if (isAction) {
        command = "action"
        payload = {
          id: action?.id,
          action_date: get("date"),
          start_time: get("time"),
          end_time: get("endTime"),
          action_type: get("actionType"),
          status: get("actionStatus"),
          primary_user_id: principal,
          contact_id: personId || null,
          location: get("location"),
          objective: get("objective"),
          notes: get("notes"),
          target_grades: selectedGrades,
          class_details: get("classesDescription"),
          estimated_students: get("students"),
          estimated_classes: get("classes"),
          support_ids: support.filter((id) => id !== principal),
        }
      } else if (modal.kind === "result") {
        command = "result"
        payload = {
          id: action?.id,
          notes: get("notes"),
          results: resultGrades.map((grade) => ({
            grade,
            classes: get(`${grade}-classes`),
            impacted: get(`${grade}-impacted`),
            leads: get(`${grade}-leads`),
            pending: get(`${grade}-pending`),
            registrations: get(`${grade}-registrations`),
          })),
        }
      } else if (modal.kind === "associate") {
        command = "associate"
        payload = { id: action?.id, publicity: form.get("publicity") === "on" }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verifique os campos.")
      return
    }
    saving.current = true
    start(async () => {
      try {
        const result =
          modal.kind === "grades"
            ? await saveSchoolGrades({
                schoolId: school.id,
                grades: selectedGrades,
              })
            : await saveSchoolCapture({
                schoolId: school.id,
                cycleId: cycle.id,
                command,
                payload,
              })
        if (result.ok) onSaved(result.message)
        else setError(result.message)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao salvar.")
      } finally {
        saving.current = false
      }
    })
  }
  const supportFields = (
    <fieldset className="rounded-lg border border-slate-200 p-3">
      <legend className="px-1 text-xs font-medium text-slate-600">
        Participantes de apoio (opcional)
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {data.owners
          .filter(
            (o) =>
              o.id !== (isAction ? principal : actor.id) &&
              (o.active !== false ||
                action?.participantes.some((p) => p.userId === o.id)),
          )
          .map((o) => (
            <label
              key={o.id}
              className="flex min-w-0 items-start gap-2 text-xs"
            >
              <input
                type="checkbox"
                checked={support.includes(o.id)}
                onChange={(e) =>
                  setSupport((current) =>
                    e.target.checked
                      ? [...current, o.id]
                      : current.filter((id) => id !== o.id),
                  )
                }
              />
              <span className="break-words">{o.nome}</span>
            </label>
          ))}
      </div>
    </fieldset>
  )
  const gradeFields = (
    <fieldset className="rounded-lg border border-slate-200 p-3">
      <legend className="px-1 text-xs font-medium text-slate-600">
        {modal.kind === "grades"
          ? "Séries oferecidas pela escola"
          : "Séries envolvidas na ação *"}
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {data.grades
          .filter((g) => g.active)
          .map((g) => (
            <label key={g.code} className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={selectedGrades.includes(g.code)}
                onChange={(e) =>
                  setSelectedGrades((current) =>
                    e.target.checked
                      ? [...current, g.code]
                      : current.filter((code) => code !== g.code),
                  )
                }
              />
              {g.label}
            </label>
          ))}
      </div>
    </fieldset>
  )
  return (
    <Dialog
      title={title}
      description={`${school.nome} · ${cycle.name} · Fuso de São Paulo`}
      onClose={onClose}
      busy={pending}
    >
      <form onSubmit={submit}>
        <fieldset disabled={pending} className="space-y-4 p-4 sm:p-5">
          <p className="rounded-lg bg-brand/5 p-3 text-xs text-brand">
            <strong>Edição:</strong> {cycle.name}. Este registro não altera
            outra edição.
          </p>
          {(modal.kind === "start" || modal.kind === "contact") && (
            <>
              <Field label="Consultor">
                <input
                  readOnly
                  value={actor.name}
                  className={`${inputCls} bg-slate-50`}
                />
              </Field>
              <Field label="Situação da negociação *">
                <select
                  name="negotiationStatus"
                  className={inputCls}
                  defaultValue="em_contato"
                >
                  {stateOptions.map(([key, label]) => (
                    <option value={key} key={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              {supportFields}
            </>
          )}
          {(modal.kind === "contact" || isAction) && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Data *">
                <input
                  required
                  type="date"
                  name="date"
                  defaultValue={action?.data ?? current.date}
                  className={inputCls}
                />
              </Field>
              <Field label={isAction ? "Horário inicial *" : "Horário *"}>
                <input
                  required
                  type="time"
                  name="time"
                  defaultValue={action?.inicio?.slice(0, 5) ?? current.time}
                  className={inputCls}
                />
              </Field>
              {isAction && (
                <Field label="Horário final *">
                  <input
                    required
                    type="time"
                    name="endTime"
                    defaultValue={action?.fim?.slice(0, 5) ?? initialEnd}
                    className={inputCls}
                  />
                </Field>
              )}
            </div>
          )}
          {(modal.kind === "contact" || isAction) && (
            <Field label="Contato institucional cadastrado (opcional)">
              <select
                value={personId}
                onChange={(e) => choosePerson(e.target.value)}
                className={inputCls}
              >
                <option value="">
                  {modal.kind === "contact"
                    ? "Informar outra pessoa contatada"
                    : "Não informado"}
                </option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                    {c.papel ? ` · ${c.papel}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {modal.kind === "contact" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Pessoa contatada *">
                  <input
                    required
                    maxLength={200}
                    value={personName}
                    onChange={(e) => setPersonName(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Cargo">
                  <input
                    maxLength={200}
                    value={personRole}
                    onChange={(e) => setPersonRole(e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>
              <Field label="Canal *">
                <select
                  name="channel"
                  className={inputCls}
                  defaultValue="WhatsApp"
                >
                  {["Ligação", "WhatsApp", "E-mail", "Visita", "Outro"].map(
                    (c) => (
                      <option key={c}>{c}</option>
                    ),
                  )}
                </select>
              </Field>
              <Field label="Descrição do contato *">
                <textarea
                  required
                  name="description"
                  rows={3}
                  maxLength={5000}
                  className={inputCls}
                />
              </Field>
              <Field label="Resposta da escola">
                <textarea
                  name="response"
                  rows={2}
                  maxLength={5000}
                  className={inputCls}
                />
              </Field>
              <Field label="Próximo passo">
                <input name="nextStep" maxLength={5000} className={inputCls} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Data de retorno (opcional)">
                  <input type="date" name="returnDate" className={inputCls} />
                </Field>
                <Field label="Horário de retorno">
                  <input
                    type="time"
                    name="returnTime"
                    defaultValue="09:00"
                    className={inputCls}
                  />
                </Field>
              </div>
            </>
          )}
          {isAction && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Tipo de ação *">
                  <select
                    name="actionType"
                    defaultValue={action?.tipo ?? "Divulgação SuperVestibular"}
                    className={inputCls}
                  >
                    {TIPOS_ACAO_HS.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Situação da ação *">
                  <select
                    name="actionStatus"
                    defaultValue={
                      modal.kind === "performed"
                        ? "realizada"
                        : (action?.status ?? "agendada")
                    }
                    className={inputCls}
                  >
                    {STATUS_ACAO_HS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Consultor principal da ação *">
                <select
                  required
                  value={principal}
                  onChange={(e) => setPrincipal(e.target.value)}
                  className={inputCls}
                >
                  {data.owners
                    .filter(
                      (o) =>
                        o.active !== false || o.id === action?.primaryOwnerId,
                    )
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nome}
                        {o.active === false ? " · Inativo (histórico)" : ""}
                      </option>
                    ))}
                </select>
              </Field>
              {supportFields}
              <Field label="Local *">
                <input
                  required
                  maxLength={500}
                  name="location"
                  defaultValue={
                    action?.local ??
                    [school.logradouro, school.numero, school.cidade]
                      .filter(Boolean)
                      .join(", ")
                  }
                  className={inputCls}
                />
              </Field>
              <Field label="Objetivo *">
                <textarea
                  required
                  rows={2}
                  maxLength={5000}
                  name="objective"
                  defaultValue={
                    action?.objetivo ?? `Divulgação do ${cycle.name}`
                  }
                  className={inputCls}
                />
              </Field>
              {gradeFields}
              <Field label="Turmas envolvidas">
                <input
                  name="classesDescription"
                  maxLength={1000}
                  defaultValue={action?.turmasDescricao ?? ""}
                  className={inputCls}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Estimativa de alunos (opcional)">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    name="students"
                    defaultValue={action?.estimativaAlunos ?? ""}
                    className={inputCls}
                  />
                </Field>
                <Field label="Quantidade de turmas (opcional)">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    name="classes"
                    defaultValue={action?.estimativaTurmas ?? ""}
                    className={inputCls}
                  />
                </Field>
              </div>
              <Field label="Observações">
                <textarea
                  name="notes"
                  rows={3}
                  maxLength={5000}
                  defaultValue={action?.observacoes ?? ""}
                  className={inputCls}
                />
              </Field>
            </>
          )}
          {modal.kind === "result" && (
            <>
              <p className="text-sm font-medium">
                {action?.tipo} · {action && actionLabel(action)}
              </p>
              <p className="text-xs text-slate-500">
                Preencha 0 quando o resultado for zero. Campos obrigatórios
                vazios continuam pendentes. Apoios não multiplicam os totais.
              </p>
              {resultGrades.map((grade) => {
                const result = action?.resultados.find(
                    (r) => r.serie === grade,
                  ),
                  g = data.grades.find((g) => g.code === grade)
                return (
                  <fieldset
                    key={grade}
                    className="space-y-3 rounded-xl border border-slate-200 p-3"
                  >
                    <legend className="px-1 text-sm font-semibold">
                      {g?.label ?? grade}
                    </legend>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label={`Turmas — ${g?.label ?? grade}`}>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          name={`${grade}-classes`}
                          defaultValue={result?.turmas ?? ""}
                          className={inputCls}
                        />
                      </Field>
                      <Field label={`Alunos impactados — ${g?.label ?? grade}`}>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          name={`${grade}-impacted`}
                          defaultValue={result?.impactados ?? ""}
                          className={inputCls}
                        />
                      </Field>
                      <Field
                        label={`Leads / fichas coletadas — ${g?.label ?? grade} *`}
                      >
                        <input
                          required
                          type="number"
                          min={0}
                          step={1}
                          name={`${grade}-leads`}
                          defaultValue={result?.leads ?? ""}
                          className={inputCls}
                        />
                      </Field>
                      {g?.supervestEligible && (
                        <>
                          <Field
                            label={`Inscrições aguardando lançamento — ${g.label} *`}
                          >
                            <input
                              required
                              type="number"
                              min={0}
                              step={1}
                              name={`${grade}-pending`}
                              defaultValue={result?.inscricoesPendentes ?? ""}
                              className={inputCls}
                            />
                          </Field>
                          <Field
                            label={`Inscrições lançadas / conferidas — ${g.label} *`}
                          >
                            <input
                              required
                              type="number"
                              min={0}
                              step={1}
                              name={`${grade}-registrations`}
                              defaultValue={result?.inscricoesSupervest ?? ""}
                              className={inputCls}
                            />
                          </Field>
                        </>
                      )}
                    </div>
                    {!result && resultGrades.length > 1 && (
                      <button
                        type="button"
                        className={buttonCls}
                        onClick={() =>
                          setResultGrades((current) =>
                            current.filter((v) => v !== grade),
                          )
                        }
                      >
                        Remover série não preenchida
                      </button>
                    )}
                  </fieldset>
                )
              })}
              <button
                type="button"
                className={buttonCls}
                disabled={resultGrades.length >= data.grades.length}
                onClick={() => {
                  const next = data.grades.find(
                    (g) => !resultGrades.includes(g.code),
                  )
                  if (next)
                    setResultGrades((current) => [...current, next.code])
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar série
              </button>
              <Field label="Observações sobre os resultados">
                <textarea
                  name="notes"
                  maxLength={5000}
                  defaultValue={action?.resultadoObs ?? ""}
                  rows={3}
                  className={inputCls}
                />
              </Field>
            </>
          )}
          {modal.kind === "grades" && (
            <>
              {gradeFields}
              <p className="text-xs text-slate-500">
                Confirme todas as séries oferecidas. O cadastro institucional é
                compartilhado entre edições; os registros anteriores serão
                preservados.
              </p>
            </>
          )}
          {modal.kind === "associate" && (
            <>
              <p className="text-sm">
                {action?.tipo} · {action && actionLabel(action)}
              </p>
              <p className="text-xs text-amber-800">
                Confirme que este registro pertence ao {cycle.name}. O vínculo
                não será deduzido pela data.
              </p>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  name="publicity"
                  defaultChecked={Boolean(
                    action &&
                      [
                        "Divulgação SuperVestibular",
                        "Ação de captação",
                      ].includes(action.tipo),
                  )}
                />
                Esta ação foi divulgação desta edição do SuperVest
              </label>
            </>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800"
            >
              {error}
            </p>
          )}
        </fieldset>
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t bg-white px-4 py-3">
          <button
            type="button"
            disabled={pending}
            className={buttonCls}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button disabled={pending} className={primaryCls}>
            {pending
              ? "Salvando…"
              : modal.kind === "result"
                ? "Salvar resultado"
                : "Salvar registro"}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
