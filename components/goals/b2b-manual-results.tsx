"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { saveB2bResult } from "@/app/actions/b2b-results"

export type B2bResult = { id: string; company_id: string; user_id: string; commercial_cycle_id: string; target_value: number | null; registrations: number | null; revision: number; notes: string | null }
type Option = { id: string; name: string }
const field = "w-full min-w-0 rounded-md border border-slate-300 bg-white p-2 text-sm"
export function B2bManualResults({ results, companies, people, cycles, history, canWrite }: {
  results: B2bResult[]; companies: Option[]; people: Option[]; cycles: Option[]; canWrite: boolean;
  history: { id: string; result_id: string; changed_by_name: string; changed_at: string; new_values: { target_value?: number | null; registrations?: number | null } }[]
}) {
  const router = useRouter(), [busy, start] = useTransition()
  const [notice, setNotice] = useState(""), [editing, setEditing] = useState<B2bResult | null>(null)
  const name = (items: Option[], id: string) => items.find(x => x.id === id)?.name || "Registro preservado"
  return <section className="mx-auto max-w-6xl space-y-4">
    <h1 className="text-xl font-semibold">Metas e inscrições B2B por empresa</h1>
    <p className="text-sm text-slate-600">Lançamento manual por consultor e ciclo comercial. Vazio significa sem lançamento; zero é um resultado informado. Cada alteração preserva autor, data e valores anteriores.</p>
    {notice && <p role="status" className="rounded border p-3 text-sm">{notice}</p>}
    {canWrite && <form key={editing?.id || "new"} className="grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-2" onSubmit={event => {
      event.preventDefault(); const element = event.currentTarget; const form = new FormData(element)
      start(async () => {
        try { const result = await saveB2bResult(form); setNotice(result.message); if (result.ok) { element.reset(); setEditing(null); router.refresh() } }
        catch { setNotice("Não foi possível confirmar a gravação. Os campos foram preservados; atualize a lista antes de tentar novamente.") }
      })
    }}>
      <input type="hidden" name="revision" value={editing?.revision || 0} />
      {([["Consultor", "user_id", people, editing?.user_id], ["Empresa", "company_id", companies, editing?.company_id], ["Ciclo comercial", "commercial_cycle_id", cycles, editing?.commercial_cycle_id]] as const).map(([label, key, options, selected]) => <label key={key} className="text-sm">{label}
        <select aria-label={label} name={key} className={field} required defaultValue={selected || ""} disabled={busy || !!editing}>
          <option value="">Selecione</option>{options.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>{editing && <input type="hidden" name={key} value={selected} />}
      </label>)}
      <label className="text-sm">Meta de inscrições<input name="target_value" type="number" min="0" max="2147483647" step="1" defaultValue={editing?.target_value ?? ""} className={field} /></label>
      <label className="text-sm">Inscrições realizadas<input name="registrations" type="number" min="0" max="2147483647" step="1" defaultValue={editing?.registrations ?? ""} className={field} /></label>
      <label className="text-sm sm:col-span-2">Observações / motivo<textarea name="notes" maxLength={5000} defaultValue={editing?.notes || ""} className={field} /></label>
      <div className="flex gap-3 sm:col-span-2"><button disabled={busy} className="rounded bg-brand px-4 py-2 text-sm text-white">Salvar lançamento</button>{editing && <button type="button" onClick={() => setEditing(null)} className="text-sm">Cancelar edição</button>}</div>
    </form>}
    <div className="uni-scroll-region max-w-full overflow-x-auto rounded-lg border" tabIndex={0} role="region" aria-label="Lançamentos B2B">
      <table className="w-full min-w-[650px] text-left text-sm"><thead><tr>{["Consultor", "Empresa", "Ciclo", "Meta", "Inscrições", "Histórico"].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>
        {results.map(row => <tr key={row.id} className="border-t"><td className="p-3">{name(people, row.user_id)}</td><td className="p-3">{name(companies, row.company_id)}</td><td className="p-3">{name(cycles, row.commercial_cycle_id)}</td><td className="p-3">{row.target_value ?? "Sem lançamento"}</td><td className="p-3">{row.registrations ?? "Sem lançamento"}</td><td className="p-3">
          {canWrite && <button onClick={() => setEditing(row)} className="text-brand underline">Editar lançamento</button>}
          <details><summary>Ver histórico</summary>{history.filter(h => h.result_id === row.id).map(h => <p key={h.id} className="mt-2">{h.changed_by_name} · {new Date(h.changed_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · Meta: {h.new_values.target_value ?? "sem lançamento"}; inscrições: {h.new_values.registrations ?? "sem lançamento"}</p>)}</details>
        </td></tr>)}
      </tbody></table>
      {!results.length && <p className="p-4 text-sm">Nenhum lançamento manual para este acesso.</p>}
    </div>
  </section>
}
