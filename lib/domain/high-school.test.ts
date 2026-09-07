import { describe, it, expect } from "vitest"
import { construirFilaHS, type Escola, type AcaoEscola, type FilaHSEntrada } from "./high-school"
import { somarDias } from "./utils"

const HOJE = "2026-08-19"

function escola(over: Partial<Escola> = {}): Escola {
  return {
    id: over.id || "e1",
    nome: over.nome || "Escola Teste",
    rede: over.rede || "Estadual",
    etapa: over.etapa || "Mapeada",
    ...over,
  }
}

function acao(over: Partial<AcaoEscola> = {}): AcaoEscola {
  return {
    id: over.id || "a1",
    escolaId: over.escolaId || "e1",
    data: over.data || HOJE,
    tipo: over.tipo || "Visita de relacionamento",
    status: over.status || "agendada",
    participantes: [],
    resultados: [],
    ...over,
  }
}

function entrada(over: Partial<FilaHSEntrada> = {}): FilaHSEntrada {
  return {
    escolas: [],
    acoes: [],
    seriesElegiveis: ["EM3"],
    seriesPorEscola: {},
    hoje: HOJE,
    ...over,
  }
}

describe("construirFilaHS — filtros de exclusão", () => {
  it("ignora sem potencial, sem retorno e relacionamento pausado", () => {
    const fila = construirFilaHS(
      entrada({
        escolas: [
          escola({ id: "a", classificacao: "Sem potencial" }),
          escola({ id: "b", etapa: "Sem retorno" }),
          escola({ id: "c", etapa: "Relacionamento pausado" }),
        ],
      }),
    )
    expect(fila).toHaveLength(0)
  })
})

describe("construirFilaHS — elegibilidade de série", () => {
  it("série elegível sem divulgação SuperVest gera item", () => {
    const [item] = construirFilaHS(
      entrada({
        escolas: [escola({ id: "e1", classificacao: "Regular", ultimaAcaoEm: HOJE })],
        seriesElegiveis: ["EM3"],
        seriesPorEscola: { e1: ["EM1", "EM3"] },
      }),
    )
    expect(item.motivos.some((m) => m.includes("série elegível") && m.includes("SuperVest"))).toBe(true)
  })

  it("série elegível COM divulgação agendada não gera o alerta de divulgação", () => {
    const fila = construirFilaHS(
      entrada({
        escolas: [escola({ id: "e1", classificacao: "Regular", ultimaAcaoEm: HOJE })],
        acoes: [acao({ escolaId: "e1", tipo: "Divulgação SuperVestibular", status: "agendada" })],
        seriesElegiveis: ["EM3"],
        seriesPorEscola: { e1: ["EM3"] },
      }),
    )
    const item = fila.find((i) => i.escola.id === "e1")
    expect(item?.motivos.some((m) => m.includes("nenhuma divulgação SuperVest")) ?? false).toBe(false)
  })

  it("escola SEM série elegível não recebe o alerta de divulgação", () => {
    const fila = construirFilaHS(
      entrada({
        escolas: [escola({ id: "e1", classificacao: "Regular", ultimaAcaoEm: HOJE })],
        seriesElegiveis: ["EM3"],
        seriesPorEscola: { e1: ["EM1", "EM2"] },
      }),
    )
    const item = fila.find((i) => i.escola.id === "e1")
    expect(item?.motivos.some((m) => m.includes("série elegível")) ?? false).toBe(false)
  })
})

describe("construirFilaHS — prioridade e ordenação", () => {
  it("escola estratégica sem ação registrada é crítica", () => {
    const [item] = construirFilaHS(
      entrada({ escolas: [escola({ id: "e1", classificacao: "Estratégica" })] }),
    )
    expect(item.nivel).toBe("critico")
    expect(item.motivos.some((m) => m.includes("estratégica"))).toBe(true)
  })

  it("follow-up atrasado gera item crítico", () => {
    const [item] = construirFilaHS(
      entrada({
        escolas: [escola({ id: "e1", classificacao: "Regular", proximaAcaoEm: somarDias(HOJE, -3), ultimaAcaoEm: HOJE })],
      }),
    )
    expect(item.nivel).toBe("critico")
    expect(item.motivos.some((m) => m.includes("Follow-up atrasado"))).toBe(true)
  })

  it("ação de amanhã ainda não confirmada é crítica", () => {
    const [item] = construirFilaHS(
      entrada({
        escolas: [escola({ id: "e1", classificacao: "Regular", ultimaAcaoEm: HOJE })],
        acoes: [acao({ escolaId: "e1", data: somarDias(HOJE, 1), status: "agendada" })],
        seriesPorEscola: {},
      }),
    )
    expect(item.nivel).toBe("critico")
    expect(item.motivos.some((m) => m.includes("amanhã"))).toBe(true)
  })

  it("ordena por peso decrescente", () => {
    const fila = construirFilaHS(
      entrada({
        escolas: [
          escola({ id: "leve", classificacao: "Regular", potencial: "Alto" }),
          escola({ id: "critico", classificacao: "Estratégica" }),
        ],
      }),
    )
    expect(fila[0].escola.id).toBe("critico")
    expect(fila[0].peso).toBeGreaterThanOrEqual(fila[1].peso)
  })
})
