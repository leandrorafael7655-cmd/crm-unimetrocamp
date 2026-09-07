import { describe, it, expect, vi } from "vitest"

// server-only lança fora de um ambiente RSC; neutralizamos no teste.
vi.mock("server-only", () => ({}))

// O admin client é trocado a cada cenário via esta variável de módulo.
let adminAtual: any
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => adminAtual,
}))

import { fecharSemanasDesde } from "./weekly-close"
import { inicioSemanaComercial } from "@/lib/domain/goals"

/**
 * Mock encadeável do query builder do Supabase. Cada método de filtro devolve
 * o próprio builder; o objeto é "thenable", resolvendo para a resposta canônica
 * da tabela quando aguardado. `upsert` registra as opções e resolve com um
 * `count` pré-programado (simulando ON CONFLICT DO NOTHING).
 */
function criarAdmin(opts: { consultores: any[]; upsertCounts: number[] }) {
  const chamadas: { upsert: { row: any; opts: any }[] } = { upsert: [] }
  const respostas: Record<string, { data: any }> = {
    profiles: { data: opts.consultores },
    goals: { data: [] }, // sem meta → alvo 0 (irrelevante para idempotência)
    goal_week_exceptions: { data: [] },
    activities: { data: [] },
  }
  const counts = [...opts.upsertCounts]

  function builder(tabela: string): any {
    const resultado = respostas[tabela] ?? { data: [] }
    const b: any = {
      select: () => b,
      eq: () => b,
      in: () => b,
      not: () => b,
      gte: () => b,
      lte: () => b,
      order: () => b,
      limit: () => b,
      upsert: (row: any, o: any) => {
        chamadas.upsert.push({ row, opts: o })
        return Promise.resolve({ error: null, count: counts.shift() ?? 0 })
      },
      then: (resolve: (v: any) => void) => resolve(resultado),
    }
    return b
  }

  return { admin: { from: (t: string) => builder(t) }, chamadas }
}

// duas segundas-feiras encerradas na janela (garante ≥1 semana a fechar)
const de = inicioSemanaComercial(new Date(Date.now() - 21 * 86400000))
const consultores = [{ id: "user-1", role: "consultor_b2b" }]

describe("fecharSemanasDesde — idempotência", () => {
  it("usa ON CONFLICT (user_id,week_start) DO NOTHING no upsert", async () => {
    const { admin, chamadas } = criarAdmin({ consultores, upsertCounts: [1, 1, 1, 1] })
    adminAtual = admin
    await fecharSemanasDesde(de)
    expect(chamadas.upsert.length).toBeGreaterThan(0)
    for (const c of chamadas.upsert) {
      expect(c.opts).toMatchObject({ onConflict: "user_id,week_start", ignoreDuplicates: true })
    }
  })

  it("primeira execução cria snapshots; segunda execução idêntica cria zero", async () => {
    // 1ª passada: cada upsert insere (count=1)
    const primeira = criarAdmin({ consultores, upsertCounts: [1, 1, 1, 1] })
    adminAtual = primeira.admin
    const r1 = await fecharSemanasDesde(de)
    expect(r1.criados).toBe(primeira.chamadas.upsert.length)
    expect(r1.criados).toBeGreaterThan(0)

    // 2ª passada: linhas já existem → ON CONFLICT DO NOTHING devolve count=0
    const segunda = criarAdmin({ consultores, upsertCounts: [0, 0, 0, 0] })
    adminAtual = segunda.admin
    const r2 = await fecharSemanasDesde(de)
    expect(r2.avaliados).toBe(r1.avaliados) // avaliou as mesmas semanas
    expect(r2.criados).toBe(0) // mas não duplicou nenhuma linha
  })
})
