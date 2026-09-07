import "server-only"
import { createClient } from "@/lib/supabase/server"
import { ETAPAS_CONVENIO, ETAPAS_ENCERRADAS } from "@/lib/domain/constants"

/* ─────────────────────────  agregados do Dashboard Geral  ─────────────────────────
   Contagens leves (count/head) para a visão executiva multi-módulo. Não carrega
   linhas: cada número é um COUNT no servidor, respeitando o RLS do ator. Os
   blocos ricos (fila HS, metas, SuperVest) reusam as queries de domínio já
   existentes na página; aqui ficam apenas os KPIs que não têm loader próprio. */

const HOJE = () => new Date().toISOString().slice(0, 10)

async function contar(
  build: (q: any) => any,
  tabela: string,
): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await build(
    supabase.from(tabela).select("id", { count: "exact", head: true }),
  )
  if (error) throw new Error(error.message)
  return count ?? 0
}

export interface ResumoB2B {
  carteira: number
  conveniadas: number
  followupAtrasado: number
  semProximaAcao: number
  conveniadaSemLink: number
}

/**
 * KPIs do bloco B2B. Quando `ownerId` é informado (consultor vendo a própria
 * carteira), todas as contagens ficam restritas ao dono; caso contrário são
 * globais (gerência/supervisão). O RLS ainda se aplica por cima.
 */
export async function resumoB2B(ownerId?: string | null): Promise<ResumoB2B> {
  const hoje = HOJE()
  const escopo = (q: any) => (ownerId ? q.eq("owner_id", ownerId) : q)
  const encerradas = `(${ETAPAS_ENCERRADAS.map((e) => `"${e}"`).join(",")})`

  const [carteira, conveniadas, followupAtrasado, semProximaAcao, conveniadaSemLink] =
    await Promise.all([
      contar((q) => escopo(q), "companies"),
      contar((q) => escopo(q).in("etapa", ETAPAS_CONVENIO), "companies"),
      contar((q) => escopo(q).lt("data_proxima_acao", hoje), "companies"),
      contar(
        (q) => escopo(q).is("data_proxima_acao", null).not("etapa", "in", encerradas),
        "companies",
      ),
      contar(
        (q) =>
          escopo(q)
            .in("etapa", ETAPAS_CONVENIO)
            .or("link_inscricao.is.null,link_inscricao.eq."),
        "companies",
      ),
    ])

  return { carteira, conveniadas, followupAtrasado, semProximaAcao, conveniadaSemLink }
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
