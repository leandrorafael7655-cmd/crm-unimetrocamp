import { describe, it, expect } from "vitest"
import { escopoDashboard } from "./dashboard-scope"

describe("escopoDashboard — visibilidade de blocos por papel", () => {
  it("gerente vê tudo, com métricas globais", () => {
    const s = escopoDashboard("gerente")
    expect(s).toEqual({
      verB2B: true,
      soCarteiraPropria: false,
      verHS: true,
      verSV: true,
      verMetas: true,
      metasGlobais: true,
      verMapa: true,
    })
  })

  it("supervisor vê tudo e enxerga metas globais (tem goals.read.all)", () => {
    const s = escopoDashboard("supervisor")
    expect(s.verB2B).toBe(true)
    expect(s.soCarteiraPropria).toBe(false)
    expect(s.verHS).toBe(true)
    expect(s.verSV).toBe(true)
    expect(s.metasGlobais).toBe(true)
    expect(s.verMapa).toBe(true)
  })

  it("consultor_b2b vê B2B (carteira global, pois tem b2b.read.all), HS/SV em leitura, metas próprias", () => {
    const s = escopoDashboard("consultor_b2b")
    expect(s.verB2B).toBe(true)
    // Tem b2b.read.all (antídoto anti-duplicação), então NÃO é só carteira própria.
    expect(s.soCarteiraPropria).toBe(false)
    expect(s.verHS).toBe(true)
    expect(s.verSV).toBe(true)
    expect(s.verMetas).toBe(true)
    // Só metas próprias — não tem goals.read.all.
    expect(s.metasGlobais).toBe(false)
    expect(s.verMapa).toBe(true)
  })

  it("high_school vê HS/SV, B2B só leitura global, metas próprias", () => {
    const s = escopoDashboard("high_school")
    expect(s.verHS).toBe(true)
    expect(s.verSV).toBe(true)
    expect(s.verB2B).toBe(true) // tem b2b.read.all
    expect(s.soCarteiraPropria).toBe(false)
    expect(s.metasGlobais).toBe(false)
    expect(s.verMapa).toBe(true)
  })

  it("papel legado 'consultor' é normalizado sem privilégio de metas globais", () => {
    const s = escopoDashboard("consultor")
    expect(s.metasGlobais).toBe(false)
    expect(s.verB2B).toBe(true)
  })

  it("papel nulo/desconhecido cai no consultor sem privilégio elevado", () => {
    const s = escopoDashboard(null)
    expect(s.metasGlobais).toBe(false)
  })
})
