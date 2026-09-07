"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { X, Plus, TrendingUp, AlertTriangle } from "lucide-react"
import { Card, PageHeader, Chip, EmptyState, Stat } from "@/components/high-school/hs-ui"
import { CurvaEvolucao, type PontoCurva } from "@/components/goals/curva-evolucao"
import { createSupervestCycle, addSupervestSnapshot } from "@/app/actions/supervest"
import { ROTULO_STATUS_SUPERVEST, STATUS_SUPERVEST } from "@/lib/domain/goals"

const inputCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand/30"
const labelCls = "mb-1 block text-xs font-medium text-slate-600"

export interface CicloView {
  id: string
  name: string
  edition: string | null
  status: string
  registrationsTarget: number
  eventAt: string | null
}
export interface ApuracaoView {
  oficial: number
  hsAtribuidas: number
  b2bAtribuidas: number
  outrosCanais: number
  inconsistente: boolean
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  )
}

export function SupervestClient({
  ciclos,
  cicloAtivo,
  apuracao,
  curva,
  metaRegistros,
  podeEscrever,
}: {
  ciclos: CicloView[]
  cicloAtivo: CicloView | null
  apuracao: ApuracaoView | null
  curva: PontoCurva[]
  metaRegistros: number
  podeEscrever: boolean
}) {
  const router = useRouter()
  const [novo, setNovo] = useState(false)
  const [snap, setSnap] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function trocarCiclo(id: string) {
    router.push(`/supervest?ciclo=${id}`)
  }

  function enviar(action: (fd: FormData) => Promise<{ ok: boolean; message?: string }>, form: HTMLFormElement, fechar: () => void) {
    setErro(null)
    const fd = new FormData(form)
    start(async () => {
      const r = await action(fd)
      if (r.ok) {
        fechar()
        router.refresh()
      } else {
        setErro(r.message ?? "Erro ao salvar.")
      }
    })
  }

  return (
    <div>
      <PageHeader
        titulo="SuperVestibular"
        descricao="Ciclos de captação, leitura oficial de inscrições e origem atribuída"
        acao={
          podeEscrever ? (
            <button
              onClick={() => setNovo(true)}
              className="flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Novo SuperVest
            </button>
          ) : null
        }
      />

      {/* Seletor de ciclo */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {ciclos.length === 0 ? (
          <span className="text-sm text-slate-400">Nenhum ciclo cadastrado.</span>
        ) : (
          ciclos.map((c) => (
            <button
              key={c.id}
              onClick={() => trocarCiclo(c.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                cicloAtivo?.id === c.id ? "bg-brand text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {c.name}
            </button>
          ))
        )}
      </div>

      {!cicloAtivo ? (
        <EmptyState
          titulo="Nenhum ciclo selecionado"
          descricao="Selecione ou crie um ciclo do SuperVestibular para acompanhar a evolução."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {/* Cabeçalho do ciclo */}
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{cicloAtivo.name}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Chip className="border-brand/20 bg-brand/10 text-brand">
                    {ROTULO_STATUS_SUPERVEST[cicloAtivo.status as keyof typeof ROTULO_STATUS_SUPERVEST] ?? cicloAtivo.status}
                  </Chip>
                  {cicloAtivo.eventAt && (
                    <span className="text-xs text-slate-500">
                      Evento: {new Date(cicloAtivo.eventAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  )}
                </div>
              </div>
              {podeEscrever && (
                <button
                  onClick={() => setSnap(true)}
                  className="rounded-md border border-slate-300 px-3.5 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                >
                  Registrar leitura oficial
                </button>
              )}
            </div>
          </Card>

          {/* Apuração anti-dupla-contagem */}
          {apuracao && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat rotulo="Inscrição oficial" valor={apuracao.oficial} destaque />
              <Stat rotulo="Atribuídas a HS" valor={apuracao.hsAtribuidas} />
              <Stat rotulo="Atribuídas a B2B" valor={apuracao.b2bAtribuidas} />
              <Stat rotulo="Outros canais" valor={apuracao.outrosCanais} />
            </div>
          )}

          {apuracao?.inconsistente && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Atribuições (HS + B2B) excedem a inscrição oficial. Revise os lançamentos ou a leitura oficial — a oficial nunca é a soma das atribuídas.
            </div>
          )}

          {/* Curva de evolução */}
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-brand" />
              <h3 className="text-sm font-semibold text-slate-900">Curva de evolução</h3>
              <span className="ml-auto text-xs text-slate-400">Meta: {metaRegistros} inscrições</span>
            </div>
            <div className="text-slate-700">
              <CurvaEvolucao pontos={curva} meta={metaRegistros} />
            </div>
          </Card>
        </div>
      )}

      {/* Modal novo ciclo */}
      {novo && (
        <Modal titulo="Novo SuperVestibular" onClose={() => setNovo(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              enviar(createSupervestCycle, e.currentTarget, () => setNovo(false))
            }}
            className="flex flex-col gap-3"
          >
            <Campo label="Nome do ciclo *">
              <input name="name" required className={inputCls} placeholder="Ex.: SuperVestibular 2026.1" />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Edição">
                <input name="edition" className={inputCls} placeholder="2026.1" />
              </Campo>
              <Campo label="Status">
                <select name="status" defaultValue="planejamento" className={inputCls}>
                  {STATUS_SUPERVEST.map((s) => (
                    <option key={s} value={s}>
                      {ROTULO_STATUS_SUPERVEST[s]}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Meta de inscrições">
                <input name="registrations_target" type="number" min={0} defaultValue={0} className={inputCls} />
              </Campo>
              <Campo label="Meta de ações HS">
                <input name="high_school_actions_target" type="number" min={0} defaultValue={0} className={inputCls} />
              </Campo>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Início da captação">
                <input name="campaign_start_at" type="date" className={inputCls} />
              </Campo>
              <Campo label="Data/hora do evento">
                <input name="event_at" type="datetime-local" className={inputCls} />
              </Campo>
            </div>
            {erro && <p className="text-sm text-red-600">{erro}</p>}
            <BotoesModal pending={pending} onClose={() => setNovo(false)} />
          </form>
        </Modal>
      )}

      {/* Modal snapshot */}
      {snap && cicloAtivo && (
        <Modal titulo="Registrar leitura oficial" onClose={() => setSnap(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              enviar(addSupervestSnapshot, e.currentTarget, () => setSnap(false))
            }}
            className="flex flex-col gap-3"
          >
            <input type="hidden" name="cycle_id" value={cicloAtivo.id} />
            <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
              A leitura oficial é o total lido no sistema do SuperVest naquele dia — não é a soma das atribuições de HS/B2B.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Data da leitura *">
                <input name="snapshot_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={inputCls} />
              </Campo>
              <Campo label="Inscrições oficiais *">
                <input name="official_registrations" type="number" min={0} required className={inputCls} />
              </Campo>
            </div>
            <Campo label="Observações">
              <input name="notes" className={inputCls} />
            </Campo>
            {erro && <p className="text-sm text-red-600">{erro}</p>}
            <BotoesModal pending={pending} onClose={() => setSnap(false)} />
          </form>
        </Modal>
      )}
    </div>
  )
}

function Modal({ titulo, children, onClose }: { titulo: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">{titulo}</h3>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function BotoesModal({ pending, onClose }: { pending: boolean; onClose: () => void }) {
  return (
    <div className="mt-2 flex justify-end gap-2">
      <button type="button" onClick={onClose} className="rounded-md px-3.5 py-2 text-sm text-slate-600 hover:bg-slate-100">
        Cancelar
      </button>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-3.5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Salvando…" : "Salvar"}
      </button>
    </div>
  )
}
