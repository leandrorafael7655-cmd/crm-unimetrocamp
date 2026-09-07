"use client"

import { useState, useTransition, useEffect } from "react"
import { useRouter } from "next/navigation"
import { X, Plus, History, CalendarOff } from "lucide-react"
import { Card, PageHeader, Chip, EmptyState } from "@/components/high-school/hs-ui"
import { BarraProgresso, AderenciaCard } from "@/components/goals/goal-cards"
import {
  createGoal,
  updateGoal,
  getGoalHistory,
  upsertWeekException,
  removeWeekException,
} from "@/app/actions/goals"
import { GOAL_TYPES } from "@/lib/domain/goals"

const inputCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand/30"
const labelCls = "mb-1 block text-xs font-medium text-slate-600"

export interface MetaView {
  id: string
  goalType: string
  goalTypeLabel: string
  unit: string
  scopeType: "geral" | "individual"
  teamType: string | null
  userId: string | null
  userName: string | null
  targetValue: number
  realizado: number
  atingimentoPct: number
  faltante: number
  startAt: string
  endAt: string
  status: string
  notes: string | null
  supervestCycleId: string | null
  commercialCycleId: string | null
}
export interface ConsultorView {
  userId: string
  userName: string
  aderenciaPct: number
  semanasAtingidas: number
  semanasAplicaveis: number
  semanaCorrente: { completed: number; target: number; achieved: boolean } | null
}
export interface OwnerView {
  id: string
  nome: string
  role: string
}
export interface CicloOption {
  id: string
  name: string
}
export interface ExcecaoView {
  id: string
  userId: string
  userName: string | null
  weekStart: string
  reason: string | null
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  )
}

function statusChip(status: string) {
  if (status === "ativa") return <Chip className="border-emerald-200 bg-emerald-50 text-emerald-700">Ativa</Chip>
  if (status === "encerrada") return <Chip className="border-slate-200 bg-slate-100 text-slate-500">Encerrada</Chip>
  return <Chip className="border-amber-200 bg-amber-50 text-amber-700">Rascunho</Chip>
}

export function MetasClient({
  metas,
  consultores,
  owners,
  ciclosComerciais,
  ciclosSupervest,
  excecoes,
  podeEscrever,
}: {
  metas: MetaView[]
  consultores: ConsultorView[]
  owners: OwnerView[]
  ciclosComerciais: CicloOption[]
  ciclosSupervest: CicloOption[]
  excecoes: ExcecaoView[]
  podeEscrever: boolean
}) {
  const [aba, setAba] = useState<"metas" | "semanais">("metas")
  const [novaAberta, setNovaAberta] = useState(false)
  const [edit, setEdit] = useState<MetaView | null>(null)

  return (
    <>
      <PageHeader
        titulo="Central de Metas"
        descricao="Metas administráveis por ciclo — sem deploy para mudar alvo, período ou status."
        acao={
          podeEscrever && aba === "metas" ? (
            <button
              onClick={() => setNovaAberta(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Nova meta
            </button>
          ) : undefined
        }
      />

      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {(
          [
            ["metas", "Metas"],
            ["semanais", "B2B · Ações semanais"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setAba(k)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition ${
              aba === k
                ? "border-brand font-medium text-brand"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === "metas" ? (
        <MetasTabela metas={metas} podeEscrever={podeEscrever} onEditar={setEdit} />
      ) : (
        <SemanaisTab
          consultores={consultores}
          owners={owners}
          excecoes={excecoes}
          podeEscrever={podeEscrever}
        />
      )}

      {novaAberta && (
        <MetaModal
          modo="criar"
          owners={owners}
          ciclosComerciais={ciclosComerciais}
          ciclosSupervest={ciclosSupervest}
          onFechar={() => setNovaAberta(false)}
        />
      )}
      {edit && (
        <MetaModal
          modo="editar"
          meta={edit}
          owners={owners}
          ciclosComerciais={ciclosComerciais}
          ciclosSupervest={ciclosSupervest}
          onFechar={() => setEdit(null)}
        />
      )}
    </>
  )
}

/* ─────────────────────────────  tabela de metas  ───────────────────────── */

function MetasTabela({
  metas,
  podeEscrever,
  onEditar,
}: {
  metas: MetaView[]
  podeEscrever: boolean
  onEditar: (m: MetaView) => void
}) {
  if (metas.length === 0) {
    return (
      <EmptyState
        titulo="Nenhuma meta cadastrada"
        descricao="Crie a primeira meta para acompanhar leads, inscrições e ações por ciclo."
      />
    )
  }
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2.5 font-medium">Meta</th>
              <th className="px-4 py-2.5 font-medium">Responsável</th>
              <th className="px-4 py-2.5 font-medium">Período</th>
              <th className="px-4 py-2.5 text-right font-medium">Alvo</th>
              <th className="px-4 py-2.5 text-right font-medium">Realizado</th>
              <th className="px-4 py-2.5 font-medium">Progresso</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              {podeEscrever && <th className="px-4 py-2.5" />}
            </tr>
          </thead>
          <tbody>
            {metas.map((m) => (
              <tr key={m.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{m.goalTypeLabel}</div>
                  <div className="text-xs text-slate-400">
                    {m.scopeType === "geral" ? "Meta geral" : "Individual"}
                    {m.teamType ? ` · ${m.teamType.toUpperCase()}` : ""}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{m.userName ?? "—"}</td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {fmtData(m.startAt)} → {fmtData(m.endAt)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                  {m.targetValue.toLocaleString("pt-BR")}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900">
                  {m.realizado.toLocaleString("pt-BR")}
                </td>
                <td className="px-4 py-3">
                  <div className="w-32">
                    <BarraProgresso pct={m.atingimentoPct} />
                    <div className="mt-1 flex justify-between text-[11px] text-slate-400">
                      <span className="tabular-nums">{m.atingimentoPct}%</span>
                      <span className="tabular-nums">
                        {m.faltante > 0 ? `faltam ${m.faltante.toLocaleString("pt-BR")}` : "ok"}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">{statusChip(m.status)}</td>
                {podeEscrever && (
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onEditar(m)}
                      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      Editar
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/* ─────────────────────────────  modal criar/editar  ───────────────────────── */

function MetaModal({
  modo,
  meta,
  owners,
  ciclosComerciais,
  ciclosSupervest,
  onFechar,
}: {
  modo: "criar" | "editar"
  meta?: MetaView
  owners: OwnerView[]
  ciclosComerciais: CicloOption[]
  ciclosSupervest: CicloOption[]
  onFechar: () => void
}) {
  const [erro, setErro] = useState("")
  const [scope, setScope] = useState<"geral" | "individual">(meta?.scopeType ?? "geral")
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function enviar(form: FormData) {
    setErro("")
    startTransition(async () => {
      const res = modo === "criar" ? await createGoal(form) : await updateGoal(form)
      if (!res.ok) {
        setErro(res.message ?? "Erro.")
        return
      }
      onFechar()
      router.refresh()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-800">
            {modo === "criar" ? "Nova meta" : "Editar meta"}
          </h2>
          <button onClick={onFechar} className="text-slate-400 hover:text-slate-700" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form action={enviar} className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {meta && <input type="hidden" name="id" value={meta.id} />}

          {modo === "criar" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Campo label="Tipo de meta *">
                  <select name="goal_type" required className={inputCls} defaultValue="">
                    <option value="" disabled>
                      Selecione…
                    </option>
                    {Object.entries(GOAL_TYPES).map(([code, label]) => (
                      <option key={code} value={code}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Campo>
              </div>
              <Campo label="Escopo">
                <select
                  name="scope_type"
                  className={inputCls}
                  value={scope}
                  onChange={(e) => setScope(e.target.value as "geral" | "individual")}
                >
                  <option value="geral">Geral (institucional)</option>
                  <option value="individual">Individual</option>
                </select>
              </Campo>
              <Campo label="Equipe">
                <select name="team_type" className={inputCls} defaultValue="todos">
                  <option value="todos">Todos</option>
                  <option value="b2b">B2B</option>
                  <option value="high_school">High School</option>
                </select>
              </Campo>
              {scope === "individual" && (
                <div className="sm:col-span-2">
                  <Campo label="Responsável *">
                    <select name="user_id" className={inputCls} defaultValue="">
                      <option value="" disabled>
                        Selecione o consultor…
                      </option>
                      {owners.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.nome}
                        </option>
                      ))}
                    </select>
                  </Campo>
                </div>
              )}
              <Campo label="Ciclo comercial">
                <select name="commercial_cycle_id" className={inputCls} defaultValue="">
                  <option value="">—</option>
                  {ciclosComerciais.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Ciclo SuperVest">
                <select name="supervest_cycle_id" className={inputCls} defaultValue="">
                  <option value="">—</option>
                  {ciclosSupervest.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Alvo *">
                <input name="target_value" type="number" min={0} step="1" required className={inputCls} />
              </Campo>
              <Campo label="Status">
                <select name="status" className={inputCls} defaultValue="ativa">
                  <option value="ativa">Ativa</option>
                  <option value="rascunho">Rascunho</option>
                  <option value="encerrada">Encerrada</option>
                </select>
              </Campo>
              <Campo label="Início *">
                <input name="start_at" type="date" required className={inputCls} />
              </Campo>
              <Campo label="Fim *">
                <input name="end_at" type="date" required className={inputCls} />
              </Campo>
              <div className="sm:col-span-2">
                <Campo label="Observações">
                  <textarea name="notes" rows={2} className={inputCls} />
                </Campo>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {meta!.goalTypeLabel} · {meta!.scopeType === "geral" ? "Geral" : meta!.userName}
              </div>
              <Campo label="Novo alvo">
                <input
                  name="target_value"
                  type="number"
                  min={0}
                  step="1"
                  defaultValue={meta!.targetValue}
                  className={inputCls}
                />
              </Campo>
              <Campo label="Status">
                <select name="status" className={inputCls} defaultValue={meta!.status}>
                  <option value="ativa">Ativa</option>
                  <option value="rascunho">Rascunho</option>
                  <option value="encerrada">Encerrada</option>
                </select>
              </Campo>
              <Campo label="Início">
                <input name="start_at" type="date" defaultValue={meta!.startAt} className={inputCls} />
              </Campo>
              <Campo label="Fim">
                <input name="end_at" type="date" defaultValue={meta!.endAt} className={inputCls} />
              </Campo>
              <div className="sm:col-span-2">
                <Campo label="Motivo da alteração (registrado no histórico)">
                  <input name="reason" placeholder="Ex.: revisão de meta do trimestre" className={inputCls} />
                </Campo>
              </div>
              <div className="sm:col-span-2">
                <Campo label="Observações">
                  <textarea name="notes" rows={2} defaultValue={meta!.notes ?? ""} className={inputCls} />
                </Campo>
              </div>
              <div className="sm:col-span-2">
                <HistoricoMeta goalId={meta!.id} />
              </div>
            </div>
          )}

          {erro && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{erro}</p>}

          <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={onFechar}
              className="rounded-md border border-slate-300 px-3.5 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function HistoricoMeta({ goalId }: { goalId: string }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getGoalHistory>> | null>(null)
  useEffect(() => {
    getGoalHistory(goalId).then(setRows)
  }, [goalId])
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-600">
        <History className="h-3.5 w-3.5" /> Histórico de alterações
      </p>
      {rows === null ? (
        <p className="text-xs text-slate-400">Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-slate-400">Sem alterações registradas.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((h) => (
            <li key={h.id} className="text-xs text-slate-600">
              <span className="font-medium">{rotuloCampo(h.fieldChanged)}</span>
              {h.previousValue != null && (
                <>
                  : <span className="text-slate-400 line-through">{h.previousValue}</span> →{" "}
                  <span className="tabular-nums">{h.newValue}</span>
                </>
              )}
              <span className="text-slate-400">
                {" "}
                · {fmtDataHora(h.changedAt)}
                {h.changedByName ? ` · ${h.changedByName}` : ""}
              </span>
              {h.reason && <div className="text-slate-400">“{h.reason}”</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ─────────────────────────────  aba B2B semanais  ───────────────────────── */

function SemanaisTab({
  consultores,
  owners,
  excecoes,
  podeEscrever,
}: {
  consultores: ConsultorView[]
  owners: OwnerView[]
  excecoes: ExcecaoView[]
  podeEscrever: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState("")
  const router = useRouter()

  function marcar(form: FormData) {
    setErro("")
    startTransition(async () => {
      const res = await upsertWeekException(form)
      if (!res.ok) setErro(res.message ?? "Erro.")
      else router.refresh()
    })
  }
  function remover(id: string) {
    startTransition(async () => {
      const fd = new FormData()
      fd.set("id", id)
      const res = await removeWeekException(fd)
      if (!res.ok) setErro(res.message ?? "Erro.")
      else router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <section>
        <p className="mb-2 text-sm font-medium text-slate-700">Aderência de campo por consultor</p>
        {consultores.length === 0 ? (
          <EmptyState titulo="Nenhum consultor B2B ativo" />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {consultores.map((c) => (
              <AderenciaCard
                key={c.userId}
                titulo={c.userName}
                aderenciaPct={c.aderenciaPct}
                atingidas={c.semanasAtingidas}
                aplicaveis={c.semanasAplicaveis}
                detalhe={
                  c.semanaCorrente ? (
                    <span className={c.semanaCorrente.achieved ? "text-emerald-600" : "text-slate-500"}>
                      Semana atual: {c.semanaCorrente.completed}/{c.semanaCorrente.target} ações
                    </span>
                  ) : null
                }
              />
            ))}
          </div>
        )}
      </section>

      {podeEscrever && (
        <section>
          <Card className="p-4">
            <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
              <CalendarOff className="h-4 w-4" /> Marcar semana não aplicável
            </p>
            <p className="mb-3 text-xs text-slate-400">
              Férias, afastamento ou feriado prolongado. A semana sai do cálculo de aderência (denominador).
            </p>
            <form action={marcar} className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className={labelCls}>Consultor</span>
                <select name="user_id" required className={inputCls} defaultValue="">
                  <option value="" disabled>
                    Selecione…
                  </option>
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={labelCls}>Semana (segunda-feira)</span>
                <input name="week_start" type="date" required className={inputCls} />
              </label>
              <label className="block">
                <span className={labelCls}>Motivo</span>
                <input name="reason" placeholder="Férias" className={inputCls} />
              </label>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Salvando…" : "Marcar"}
              </button>
            </form>
            {erro && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{erro}</p>}
          </Card>
        </section>
      )}

      {excecoes.length > 0 && (
        <section>
          <p className="mb-2 text-sm font-medium text-slate-700">Semanas não aplicáveis</p>
          <Card className="divide-y divide-slate-100">
            {excecoes.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-slate-700">
                  {e.userName ?? "—"} · semana de {fmtData(e.weekStart)}
                  {e.reason ? ` · ${e.reason}` : ""}
                </span>
                {podeEscrever && (
                  <button
                    onClick={() => remover(e.id)}
                    className="text-xs text-slate-400 hover:text-rose-600"
                  >
                    Remover
                  </button>
                )}
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  )
}

/* ─────────────────────────────  helpers  ───────────────────────── */

function rotuloCampo(f: string): string {
  switch (f) {
    case "created":
      return "Meta criada"
    case "target_value":
      return "Alvo alterado"
    case "status":
      return "Status alterado"
    case "start_at":
      return "Início alterado"
    case "end_at":
      return "Fim alterado"
    default:
      return f
  }
}
function fmtData(iso: string): string {
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}
function fmtDataHora(iso: string): string {
  const dt = new Date(iso)
  return dt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}
