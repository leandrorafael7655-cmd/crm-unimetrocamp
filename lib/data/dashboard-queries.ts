import "server-only"
import { createClient } from "@/lib/supabase/server"
import { ETAPAS_ENCERRADAS } from "@/lib/domain/constants"

/* ─────────────────────────  agregados do Dashboard Geral  ─────────────────────────
   Contagens leves (count/head) para a visão executiva multi-módulo. Não carrega
   linhas: cada número é um COUNT no servidor, respeitando o RLS do ator. */

const HOJE = () => new Date().toISOString().slice(0, 10)

function diasAtras(qtd: number) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - qtd)
  return d.toISOString().slice(0, 10)
}

async function contar(build: (q: any) => any, tabela: string): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await build(
    supabase.from(tabela).select("id", { count: "exact", head: true }),
  )
  if (error) throw new Error(error.message)
  return count ?? 0
}

export interface ResumoB2B {
  carteira: number
  emNegociacao: number
  followupAtrasado: number
  semProximaAcao: number
  semContato30d: number
}

/**
 * KPIs operacionais do B2B. Quando `ownerId` é informado (consultor vendo a
 * própria carteira), todas as contagens ficam restritas ao dono; caso contrário
 * são globais para gestão. O RLS continua sendo a última camada de segurança.
 */
export async function resumoB2B(ownerId?: string | null): Promise<ResumoB2B> {
  const hoje = HOJE()
  const limiteContato = diasAtras(30)
  const escopo = (q: any) => (ownerId ? q.eq("owner_id", ownerId) : q)
  const encerradas = `(${ETAPAS_ENCERRADAS.map((e) => `"${e}"`).join(",")})`
  const negociacao = ["Reunião agendada", "Diagnóstico realizado", "Proposta enviada", "Formalização"]

  const [carteira, emNegociacao, followupAtrasado, semProximaAcao, semContato30d] = await Promise.all([
    contar((q) => escopo(q), "companies"),
    contar((q) => escopo(q).in("etapa", negociacao), "companies"),
    contar(
      (q) => escopo(q).lt("data_proxima_acao", hoje).not("etapa", "in", encerradas),
      "companies",
    ),
    contar(
      (q) => escopo(q).is("data_proxima_acao", null).not("etapa", "in", encerradas),
      "companies",
    ),
    contar(
      (q) => escopo(q).or(`ultimo_contato.is.null,ultimo_contato.lt.${limiteContato}`).not("etapa", "in", encerradas),
      "companies",
    ),
  ])

  return { carteira, emNegociacao, followupAtrasado, semProximaAcao, semContato30d }
}

export interface ResumoMapa {
  empresasGeo: number
  empresasSemGeo: number
  escolasGeo: number
  escolasSemGeo: number
}

/** Cobertura de geocodificação para o resumo do mapa. */
export async function resumoMapa(): Promise<ResumoMapa> {
  const [empresasGeo, empresasSemGeo, escolasGeo, escolasSemGeo] = await Promise.all([
    contar((q) => q.not("latitude", "is", null), "companies"),
    contar((q) => q.is("latitude", null), "companies"),
    contar((q) => q.not("latitude", "is", null), "schools"),
    contar((q) => q.is("latitude", null), "schools"),
  ])
  return { empresasGeo, empresasSemGeo, escolasGeo, escolasSemGeo }
}
