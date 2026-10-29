import Link from "next/link"
import { requireCan } from "@/lib/auth/guards"
import { createClient } from "@/lib/supabase/server"
import { listCommercialCycles } from "@/lib/data/goals-queries"
import { readAllRows } from "@/lib/data/pagination"
import { B2bManualResults, type B2bResult } from "@/components/goals/b2b-manual-results"
export const dynamic = "force-dynamic"
export default async function ManualB2bPage() {
  const actor = await requireCan("goals.read.own"), client = await createClient()
  const [results, history, companies, people, cycles] = await Promise.all([
    readAllRows<B2bResult>((from, to) => client.from("b2b_cycle_results").select("*").order("id").range(from, to)),
    readAllRows<{ id: string; result_id: string; changed_by_name: string; changed_at: string; new_values: { target_value: number | null; registrations: number | null } }>((from, to) => client.from("b2b_result_history").select("id,result_id,changed_by_name,changed_at,new_values").order("changed_at", { ascending: false }).order("id").range(from, to)),
    readAllRows<{ id: string; razao_social: string }>((from, to) => client.from("companies").select("id,razao_social").order("razao_social").order("id").range(from, to)),
    readAllRows<{ id: string; full_name: string }>((from, to) => client.from("profiles").select("id,full_name").order("full_name").order("id").range(from, to)),
    listCommercialCycles(),
  ])
  return <><Link href="/gestao/metas" className="mb-4 inline-block text-sm text-brand">Voltar às metas</Link><B2bManualResults results={results} history={history} companies={companies.map(x => ({ id: x.id, name: x.razao_social }))} people={people.map(x => ({ id: x.id, name: x.full_name }))} cycles={cycles.map(x => ({ id: x.id, name: x.name }))} canWrite={actor.role === "gerente"} /></>
}
