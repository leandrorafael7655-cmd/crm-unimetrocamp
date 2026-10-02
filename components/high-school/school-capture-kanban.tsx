"use client"

import {
  CalendarPlus,
  CheckCircle2,
  ClipboardList,
  History,
  MessageSquarePlus,
  Users,
} from "lucide-react"
import { Chip } from "@/components/high-school/hs-ui"
import {
  CORES_CLASSIFICACAO_HS,
  type AcaoEscola,
} from "@/lib/domain/high-school"
import {
  CAPTURE_STATUSES,
  actionHasResults,
  publicityAction,
  type SchoolCaptureSummary,
} from "@/lib/school-capture/domain"
import {
  captureKanbanColumns,
  type CaptureOrganization,
} from "@/lib/school-capture/kanban"
import {
  actionLabel,
  instantLabel,
  interactionDateLabel,
} from "@/lib/school-capture/format"

const buttonCls =
  "inline-flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
const statusColors = {
  no_contact: "border-slate-200 bg-slate-100 text-slate-700",
  negotiating: "border-violet-200 bg-violet-50 text-violet-800",
  ready_to_schedule: "border-amber-200 bg-amber-50 text-amber-800",
  scheduled: "border-sky-200 bg-sky-50 text-sky-800",
  performed: "border-emerald-200 bg-emerald-50 text-emerald-800",
}
type Props = {
  rows: SchoolCaptureSummary[]
  organization: CaptureOrganization
  cycleName: string
  now: string
  canWrite: boolean
  actor: { id: string; role: string }
  onOpen: (
    kind: "contact" | "action" | "performed" | "result",
    schoolId: string,
    actionId?: string,
  ) => void
  onHistory: (schoolId: string) => void
}

export function SchoolCaptureKanban(props: Props) {
  const columns = captureKanbanColumns(props.rows, props.organization)
  return (
    <div className="space-y-3" data-capture-kanban>
      <p className="text-xs text-slate-500">
        {props.organization === "situation"
          ? "A situação acompanha os contatos e as ações da edição. Para agendar exige contato e negociação marcada como pronta / agendamento em conjunto."
          : "Atendimento atribuído ao consultor principal e aos integrantes da equipe da ação realizada. Uma escola pode aparecer para mais de um participante; o total geral conta a escola uma única vez."}{" "}
        A carteira permanece compartilhada.
      </p>
      <div
        className="uni-scroll-region min-w-0 overflow-x-auto pb-2"
        tabIndex={0}
        role="region"
        aria-label={`Kanban ${props.organization === "situation" ? "por situação" : "por consultor"}`}
      >
        <div className="grid gap-4 lg:flex lg:items-start">
          {columns.map((column) => (
            <section
              key={column.id}
              data-capture-column={column.id}
              aria-label={column.title}
              className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 lg:w-80 lg:shrink-0"
            >
              <div className="border-b border-slate-200 p-3">
                <h3 className="break-words text-sm font-semibold text-slate-900">
                  {column.title}
                </h3>
                <p className="mt-1 text-xs text-slate-500" data-column-count>
                  {column.rows.length} escola(s)
                  {column.actionCount !== null &&
                    ` · ${column.actionCount} ação(ões) ${column.id === "scheduled" ? "agendada(s)" : "realizada(s)"}`}
                </p>
              </div>
              <div
                className="space-y-3 p-3 lg:max-h-[70dvh] lg:overflow-y-auto"
                tabIndex={0}
                role="region"
                aria-label={`Escolas — ${column.title}`}
              >
                {!column.rows.length && (
                  <p className="rounded-lg border border-dashed border-slate-200 p-4 text-xs text-slate-500">
                    Nenhuma escola nesta coluna com os filtros aplicados.
                  </p>
                )}
                {column.rows.map((row) => (
                  <SchoolCard key={row.school.id} {...props} row={row} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
      <p className="hidden text-xs text-slate-500 lg:block">
        Role o quadro horizontalmente para consultar todas as colunas.
      </p>
    </div>
  )
}

function SchoolCard({
  row,
  actor,
  canWrite,
  onOpen,
  onHistory,
  cycleName,
  now,
}: Props & { row: SchoolCaptureSummary }) {
  const canEdit = (a: AcaoEscola) =>
    ["gerente", "supervisor", "high_school"].includes(actor.role) ||
    a.createdBy === actor.id ||
    a.primaryOwnerId === actor.id ||
    a.participantes.some((p) => p.userId === actor.id)
  const completion =
    row.nextAction ??
    row.actions.find(
      (a) =>
        publicityAction(a) &&
        ["agendada", "confirmada", "reagendada"].includes(a.status),
    )
  const result =
    row.pendingResults.find(canEdit) ??
    row.performed.find(canEdit) ??
    row.pendingResults[0] ??
    row.performed[0]
  const alerts = row.alerts.filter(
    (a) => !["Sem contato no ciclo", "Confirmar séries"].includes(a),
  )
  const recorded = row.performed.filter(actionHasResults)
  return (
    <article
      data-capture-card={row.school.id}
      aria-label={`Captação de ${row.school.nome}`}
      className="min-w-0 space-y-3 break-words rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
    >
      <div>
        <button
          onClick={() => onHistory(row.school.id)}
          className="text-left text-sm font-semibold text-brand hover:underline"
        >
          {row.school.nome}
        </button>
        <p className="mt-1 text-xs text-slate-500">
          {row.school.cidade || "Cidade não informada"} · {row.school.rede}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {row.school.classificacao && (
            <Chip className={CORES_CLASSIFICACAO_HS[row.school.classificacao]}>
              {row.school.classificacao}
            </Chip>
          )}
          <Chip>
            {row.eligibility === "eligible"
              ? "Oferece 3º ano EM"
              : row.eligibility === "unknown"
                ? "Confirmar séries"
                : "Séries alteradas · histórico"}
          </Chip>
        </div>
      </div>
      <div>
        <Chip className={statusColors[row.status]}>
          {CAPTURE_STATUSES[row.status]}
        </Chip>
        <p className="mt-1 text-xs text-slate-500">{cycleName}</p>
      </div>
      <dl className="space-y-3 text-xs text-slate-600">
        <div>
          <dt className="mb-1 font-semibold text-slate-800">
            Consultores atuando
          </dt>
          <dd>
            {row.engagements.length
              ? row.engagements.map((e) => e.user_name).join(", ")
              : "Sem atuação atual"}
          </dd>
        </div>
        <div>
          <dt className="mb-1 font-semibold text-slate-800">Último contato</dt>
          <dd>
            {row.lastInteraction ? (
              <>
                {interactionDateLabel(row.lastInteraction)} ·{" "}
                {row.lastInteraction.author}
                <br />
                {row.lastInteraction.channel}
              </>
            ) : (
              "Sem contato nesta edição"
            )}
          </dd>
        </div>
        <div>
          <dt className="mb-1 font-semibold text-slate-800">
            Próximo passo e prazo
          </dt>
          <dd>
            {row.nextSteps.length ? (
              <ul className="space-y-2">
                {row.nextSteps.map((c) => (
                  <li key={c.id}>
                    <p>{c.next_step}</p>
                    <p
                      className={
                        c.return_at && c.return_at < now
                          ? "font-medium text-rose-700"
                          : "text-slate-500"
                      }
                    >
                      {c.consultant_name} ·{" "}
                      {c.return_at ? instantLabel(c.return_at) : "Sem prazo"}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              "Próximo passo não informado"
            )}
          </dd>
        </div>
        {row.nextAction && (
          <div>
            <dt className="mb-1 font-semibold text-sky-800">
              Próximo agendamento
            </dt>
            <dd>
              {actionLabel(row.nextAction)}
              <br />
              {row.nextAction.tipo} · {row.nextAction.status}
            </dd>
          </div>
        )}
        {row.performed.length > 0 && (
          <div>
            <dt className="mb-1 font-semibold text-emerald-800">
              Atendimento realizado
            </dt>
            <dd>
              {actionLabel(row.performed[0])}
              <br />
              {row.performed[0].tipo} · {row.performed.length} ação(ões)
              realizada(s)
            </dd>
          </div>
        )}
        {row.performed.length > 0 && (
          <div>
            <dt className="mb-1 font-semibold text-slate-800">
              Participantes dos atendimentos
            </dt>
            <dd>
              {row.attendances.map((a) => a.name).join(", ") ||
                "Consultor a identificar"}
              {row.unidentifiedPerformed.length > 0 &&
                row.attendances.length > 0 && (
                  <p className="mt-1 text-amber-800">
                    {row.unidentifiedPerformed.length} atendimento(s) com
                    consultor a identificar
                  </p>
                )}
            </dd>
          </div>
        )}
        <div>
          <dt className="mb-1 font-semibold text-slate-800">
            Resultados da edição
          </dt>
          <dd>
            {recorded.length ? (
              <>
                <p>
                  {row.leads} leads · {row.registrations} inscrições conferidas
                  · {row.pendingRegistrations} a lançar
                </p>
                {row.impacted !== null && (
                  <p>{row.impacted} alunos impactados</p>
                )}
                <p className="text-slate-500">
                  {recorded.length} ação(ões) com resultado informado
                </p>
                {recorded.find((a) => a.resultadoObs)?.resultadoObs && (
                  <p className="mt-1 whitespace-pre-wrap">
                    {recorded.find((a) => a.resultadoObs)?.resultadoObs}
                  </p>
                )}
              </>
            ) : row.performed.length ? (
              "Aguardando registro de resultados"
            ) : (
              "Sem atendimento realizado nesta edição"
            )}
            {row.pendingResults.length > 0 && (
              <p className="mt-1 font-medium text-amber-800">
                {row.pendingResults.length} resultado(s) pendente(s)
              </p>
            )}
          </dd>
        </div>
      </dl>
      {alerts.length > 0 && (
        <ul
          className="space-y-1 rounded-lg bg-amber-50 p-2 text-xs text-amber-900"
          aria-label="Alertas da escola"
        >
          {alerts.map((a) => (
            <li
              key={a}
              className={
                a === "Retorno vencido" ? "font-semibold text-rose-700" : ""
              }
            >
              {a}
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-2">
        {canWrite && (
          <>
            <button
              className={buttonCls}
              onClick={() => onOpen("contact", row.school.id)}
            >
              <MessageSquarePlus className="h-3.5 w-3.5 shrink-0" />
              <span>Registrar contato</span>
            </button>
            <button
              className={buttonCls}
              onClick={() => onOpen("action", row.school.id)}
            >
              <CalendarPlus className="h-3.5 w-3.5 shrink-0" />
              <span>Agendar ação</span>
            </button>
            <button
              className={buttonCls}
              disabled={Boolean(completion && !canEdit(completion))}
              title={
                completion
                  ? `${canEdit(completion) ? "Registrar realização da ação" : "Edição restrita aos participantes, cadastrador e gestão"}: ${actionLabel(completion)}`
                  : "Registrar uma ação realizada nesta edição"
              }
              onClick={() => onOpen("performed", row.school.id, completion?.id)}
            >
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span>Registrar realização</span>
            </button>
            <button
              className={buttonCls}
              disabled={!result || !canEdit(result)}
              title={
                !result
                  ? "Disponível após registrar a realização"
                  : `${canEdit(result) ? "Registrar resultado da ação" : "Edição restrita aos participantes, cadastrador e gestão"}: ${actionLabel(result)}`
              }
              onClick={() =>
                result && onOpen("result", row.school.id, result.id)
              }
            >
              <ClipboardList className="h-3.5 w-3.5 shrink-0" />
              <span>Registrar resultado</span>
            </button>
          </>
        )}
        <button
          className={`${buttonCls} col-span-2`}
          onClick={() => onHistory(row.school.id)}
        >
          <History className="h-3.5 w-3.5 shrink-0" />
          Abrir histórico da escola
        </button>
      </div>
      <p className="flex items-start gap-1 text-[11px] text-slate-400">
        <Users className="mt-0.5 h-3 w-3 shrink-0" />
        Qualquer consultor autorizado pode atuar.
      </p>
    </article>
  )
}
