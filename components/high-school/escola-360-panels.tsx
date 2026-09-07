"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { X, Plus, Trash2, Star } from "lucide-react"
import {
  upsertContact,
  deleteContact,
  upsertEstimate,
  upsertAction,
  setActionStatus,
  deleteAction,
  type AcaoInput,
} from "@/app/actions/high-school"
import {
  TIPOS_ACAO_HS,
  STATUS_ACAO_HS,
  CORES_STATUS_ACAO,
  type ContatoEscola,
  type AcaoEscola,
  type GradeLevel,
} from "@/lib/domain/high-school"
import type { OwnerOption } from "@/lib/data/high-school-queries"
import { Card, SectionTitle, Chip, EmptyState } from "./hs-ui"

const inputCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand/30"
const btnPrim =
  "rounded-md bg-brand px-3.5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
const btnGhost = "rounded-md border border-slate-300 px-3.5 py-2 text-sm text-slate-600 hover:bg-slate-50"

function Modal({ titulo, children, onClose }: { titulo: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{titulo}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[72vh] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

/* ─────────────────────────  CONTATOS  ───────────────────────── */
export function ContatosPanel({
  escolaId,
  contatos,
  podeEscrever,
}: {
  escolaId: string
  contatos: ContatoEscola[]
  podeEscrever: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState("")
  const [pending, start] = useTransition()
  const router = useRouter()

  function enviar(form: FormData) {
    setErro("")
    start(async () => {
      const res = await upsertContact(form)
      if (!res.ok) return setErro(res.message)
      setAberto(false)
      router.refresh()
    })
  }
  function remover(id: string) {
    start(async () => {
      await deleteContact(id, escolaId)
      router.refresh()
    })
  }

  return (
    <Card className="p-4">
      <SectionTitle
        acao={
          podeEscrever ? (
            <button onClick={() => setAberto(true)} className="flex items-center gap-1 text-xs text-brand hover:underline">
              <Plus className="h-3.5 w-3.5" /> Novo
            </button>
          ) : undefined
        }
      >
        Contatos
      </SectionTitle>
      {contatos.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-400">Nenhum contato cadastrado.</p>
      ) : (
        <ul className="space-y-2">
          {contatos.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 p-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-medium text-slate-800">{c.nome}</p>
                  {c.principal && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                </div>
                <p className="text-xs text-slate-500">
                  {[c.papel, c.telefone || c.whatsapp, c.email].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              {podeEscrever && (
                <button onClick={() => remover(c.id)} className="text-slate-300 hover:text-rose-500" aria-label="Remover">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {aberto && (
        <Modal titulo="Novo contato" onClose={() => setAberto(false)}>
          <form action={enviar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input type="hidden" name="escolaId" value={escolaId} />
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600">Nome *</label>
              <input name="nome" required className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Cargo / papel</label>
              <input name="papel" className={inputCls} placeholder="Diretor, Coordenador…" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Telefone</label>
              <input name="telefone" className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">WhatsApp</label>
              <input name="whatsapp" className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">E-mail</label>
              <input name="email" type="email" className={inputCls} />
            </div>
            <label className="flex items-center gap-2 sm:col-span-2">
              <input type="checkbox" name="principal" className="h-4 w-4 rounded border-slate-300" />
              <span className="text-sm text-slate-600">Contato principal</span>
            </label>
            {erro && <p className="sm:col-span-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{erro}</p>}
            <div className="sm:col-span-2 flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" onClick={() => setAberto(false)} className={btnGhost}>
                Cancelar
              </button>
              <button type="submit" disabled={pending} className={btnPrim}>
                {pending ? "Salvando…" : "Salvar contato"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  )
}

/* ─────────────────────────  ESTIMATIVAS POR SÉRIE  ───────────────────────── */
export function EstimativasPanel({
  escolaId,
  estimativas,
  grades,
  podeEscrever,
}: {
  escolaId: string
  estimativas: { serie: string; anoLetivo: number; estimativaAlunos: number | null; numTurmas: number | null }[]
  grades: GradeLevel[]
  podeEscrever: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState("")
  const [pending, start] = useTransition()
  const router = useRouter()
  const anoAtual = new Date().getFullYear()
  const rotuloSerie = (code: string) => grades.find((g) => g.code === code)?.label ?? code

  function enviar(form: FormData) {
    setErro("")
    start(async () => {
      const res = await upsertEstimate(form)
      if (!res.ok) return setErro(res.message)
      setAberto(false)
      router.refresh()
    })
  }

  return (
    <Card className="p-4">
      <SectionTitle
        acao={
          podeEscrever ? (
            <button onClick={() => setAberto(true)} className="flex items-center gap-1 text-xs text-brand hover:underline">
              <Plus className="h-3.5 w-3.5" /> Estimar
            </button>
          ) : undefined
        }
      >
        Estimativa de alunos por série
      </SectionTitle>
      {estimativas.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-400">Sem estimativas cadastradas.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="pb-1 font-medium">Série</th>
              <th className="pb-1 font-medium">Ano</th>
              <th className="pb-1 text-right font-medium">Alunos</th>
              <th className="pb-1 text-right font-medium">Turmas</th>
            </tr>
          </thead>
          <tbody>
            {estimativas.map((e, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="py-1.5 text-slate-700">{rotuloSerie(e.serie)}</td>
                <td className="py-1.5 text-slate-500">{e.anoLetivo}</td>
                <td className="py-1.5 text-right tabular-nums text-slate-700">{e.estimativaAlunos ?? "—"}</td>
                <td className="py-1.5 text-right tabular-nums text-slate-700">{e.numTurmas ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {aberto && (
        <Modal titulo="Estimativa por série" onClose={() => setAberto(false)}>
          <form action={enviar} className="grid grid-cols-2 gap-3">
            <input type="hidden" name="escolaId" value={escolaId} />
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Série *</label>
              <select name="serie" required className={inputCls}>
                {grades.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.label}
                    {g.supervestEligible ? " (elegível SuperVest)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Ano letivo *</label>
              <input name="anoLetivo" type="number" defaultValue={anoAtual} required className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Alunos estimados</label>
              <input name="estimativaAlunos" type="number" min="0" className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Nº de turmas</label>
              <input name="numTurmas" type="number" min="0" className={inputCls} />
            </div>
            {erro && <p className="col-span-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{erro}</p>}
            <div className="col-span-2 flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" onClick={() => setAberto(false)} className={btnGhost}>
                Cancelar
              </button>
              <button type="submit" disabled={pending} className={btnPrim}>
                {pending ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  )
}

/* ─────────────────────────  AÇÕES + RESULTADOS POR SÉRIE  ───────────────────────── */
type LinhaResultado = {
  serie: string
  turmas: string
  impactados: string
  leads: string
  inscricoes: string
}

export function AcoesPanel({
  escolaId,
  acoes,
  grades,
  owners,
  podeEscrever,
}: {
  escolaId: string
  acoes: AcaoEscola[]
  grades: GradeLevel[]
  owners: OwnerOption[]
  podeEscrever: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState("")
  const [pending, start] = useTransition()
  const router = useRouter()
  const rotuloSerie = (code: string) => grades.find((g) => g.code === code)?.label ?? code
  const elegivel = (code: string) => grades.find((g) => g.code === code)?.supervestEligible ?? false

  // form state
  const [data, setData] = useState("")
  const [tipo, setTipo] = useState<string>(TIPOS_ACAO_HS[0])
  const [status, setStatus] = useState<string>("agendada")
  const [inicio, setInicio] = useState("")
  const [objetivo, setObjetivo] = useState("")
  const [ownerId, setOwnerId] = useState("")
  const [obs, setObs] = useState("")
  const [linhas, setLinhas] = useState<LinhaResultado[]>([])

  function abrir() {
    setErro("")
    setData("")
    setTipo(TIPOS_ACAO_HS[0])
    setStatus("agendada")
    setInicio("")
    setObjetivo("")
    setOwnerId("")
    setObs("")
    setLinhas([])
    setAberto(true)
  }

  function addLinha() {
    const usadas = new Set(linhas.map((l) => l.serie))
    const proxima = grades.find((g) => !usadas.has(g.code))
    if (!proxima) return
    setLinhas([...linhas, { serie: proxima.code, turmas: "", impactados: "", leads: "", inscricoes: "" }])
  }
  function setLinha(i: number, patch: Partial<LinhaResultado>) {
    setLinhas(linhas.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function rmLinha(i: number) {
    setLinhas(linhas.filter((_, idx) => idx !== i))
  }

  function salvar() {
    setErro("")
    if (!data) return setErro("Informe a data da ação.")
    const input: AcaoInput = {
      escolaId,
      data,
      inicio: inicio || null,
      tipo,
      objetivo,
      status,
      primaryOwnerId: ownerId || null,
      observacoes: obs,
      resultados: linhas.map((l) => ({
        serie: l.serie,
        turmas: l.turmas === "" ? null : Number(l.turmas),
        impactados: l.impactados === "" ? null : Number(l.impactados),
        leads: l.leads === "" ? 0 : Number(l.leads),
        inscricoesSupervest: l.inscricoes === "" ? 0 : Number(l.inscricoes),
      })),
    }
    start(async () => {
      const res = await upsertAction(input)
      if (!res.ok) return setErro(res.message)
      setAberto(false)
      router.refresh()
    })
  }

  function mudarStatus(id: string, novo: string) {
    start(async () => {
      await setActionStatus(id, novo, escolaId)
      router.refresh()
    })
  }
  function remover(id: string) {
    start(async () => {
      await deleteAction(id, escolaId)
      router.refresh()
    })
  }

  return (
    <Card className="p-4">
      <SectionTitle
        acao={
          podeEscrever ? (
            <button onClick={abrir} className="flex items-center gap-1 text-xs text-brand hover:underline">
              <Plus className="h-3.5 w-3.5" /> Nova ação
            </button>
          ) : undefined
        }
      >
        Ações e resultados
      </SectionTitle>

      {acoes.length === 0 ? (
        <EmptyState titulo="Nenhuma ação registrada" descricao="Agende visitas, palestras ou ações de captação." />
      ) : (
        <div className="space-y-3">
          {acoes.map((a) => {
            const leads = a.resultados.reduce((s, r) => s + (r.leads || 0), 0)
            const insc = a.resultados.reduce((s, r) => s + (r.inscricoesSupervest || 0), 0)
            return (
              <div key={a.id} className="rounded-lg border border-slate-100 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-800">{a.tipo}</p>
                      <Chip className={CORES_STATUS_ACAO[a.status]}>
                        <span className="capitalize">{a.status}</span>
                      </Chip>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {a.data.split("-").reverse().join("/")}
                      {a.inicio ? ` · ${a.inicio.slice(0, 5)}` : ""}
                      {a.objetivo ? ` · ${a.objetivo}` : ""}
                    </p>
                  </div>
                  {podeEscrever && (
                    <div className="flex items-center gap-1.5">
                      <select
                        value={a.status}
                        onChange={(e) => mudarStatus(a.id, e.target.value)}
                        disabled={pending}
                        className="rounded border border-slate-200 px-1.5 py-1 text-xs capitalize text-slate-600"
                        aria-label="Alterar status"
                      >
                        {STATUS_ACAO_HS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <button onClick={() => remover(a.id)} className="text-slate-300 hover:text-rose-500" aria-label="Remover ação">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
                {a.resultados.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-2 text-xs text-slate-500">
                    {a.resultados.map((r, i) => (
                      <span key={i}>
                        <span className="text-slate-700">{rotuloSerie(r.serie)}:</span> {r.leads} leads
                        {elegivel(r.serie) ? ` · ${r.inscricoesSupervest} insc.` : ""}
                      </span>
                    ))}
                    <span className="ml-auto font-medium text-slate-700">
                      Total: {leads} leads · {insc} inscrições
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {aberto && (
        <Modal titulo="Nova ação" onClose={() => setAberto(false)}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Data *</label>
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Horário</label>
              <input type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Tipo</label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputCls}>
                {TIPOS_ACAO_HS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputCls} capitalize`}>
                {STATUS_ACAO_HS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600">Objetivo</label>
              <input value={objetivo} onChange={(e) => setObjetivo(e.target.value)} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600">Responsável</label>
              <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={inputCls}>
                <option value="">— Sem responsável —</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome}
                  </option>
                ))}
              </select>
            </div>

            {/* resultados por série */}
            <div className="sm:col-span-2">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600">Resultados por série</span>
                <button type="button" onClick={addLinha} className="flex items-center gap-1 text-xs text-brand hover:underline">
                  <Plus className="h-3.5 w-3.5" /> Adicionar série
                </button>
              </div>
              {linhas.length === 0 ? (
                <p className="rounded-md border border-dashed border-slate-200 px-3 py-3 text-center text-xs text-slate-400">
                  Nenhuma série. Adicione para registrar leads e inscrições (inscrições só valem para séries elegíveis).
                </p>
              ) : (
                <div className="space-y-2">
                  {linhas.map((l, i) => {
                    const elig = elegivel(l.serie)
                    return (
                      <div key={i} className="flex flex-wrap items-end gap-2 rounded-md border border-slate-100 p-2">
                        <div className="min-w-[120px] flex-1">
                          <label className="mb-0.5 block text-[10px] text-slate-400">Série</label>
                          <select value={l.serie} onChange={(e) => setLinha(i, { serie: e.target.value })} className={`${inputCls} py-1.5`}>
                            {grades.map((g) => (
                              <option key={g.code} value={g.code}>
                                {g.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="w-16">
                          <label className="mb-0.5 block text-[10px] text-slate-400">Turmas</label>
                          <input type="number" min="0" value={l.turmas} onChange={(e) => setLinha(i, { turmas: e.target.value })} className={`${inputCls} py-1.5`} />
                        </div>
                        <div className="w-20">
                          <label className="mb-0.5 block text-[10px] text-slate-400">Leads</label>
                          <input type="number" min="0" value={l.leads} onChange={(e) => setLinha(i, { leads: e.target.value })} className={`${inputCls} py-1.5`} />
                        </div>
                        <div className="w-20">
                          <label className="mb-0.5 block text-[10px] text-slate-400">
                            Inscrições
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={elig ? l.inscricoes : ""}
                            disabled={!elig}
                            title={elig ? "" : "Série não elegível ao SuperVestibular"}
                            onChange={(e) => setLinha(i, { inscricoes: e.target.value })}
                            className={`${inputCls} py-1.5 disabled:bg-slate-50 disabled:text-slate-300`}
                          />
                        </div>
                        <button type="button" onClick={() => rmLinha(i)} className="mb-1.5 text-slate-300 hover:text-rose-500" aria-label="Remover linha">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600">Observações</label>
              <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} className={inputCls} />
            </div>

            {erro && <p className="sm:col-span-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{erro}</p>}
            <div className="sm:col-span-2 flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" onClick={() => setAberto(false)} className={btnGhost}>
                Cancelar
              </button>
              <button type="button" onClick={salvar} disabled={pending} className={btnPrim}>
                {pending ? "Salvando…" : "Salvar ação"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  )
}
