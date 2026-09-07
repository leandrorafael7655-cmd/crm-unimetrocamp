import { describe, it, expect } from "vitest"
import {
  linkDaEmpresa, linkDefasado, linkAtivo, saudeConvenio, construirFila,
  type Empresa,
} from "./pipeline"
import { somarDias } from "./utils"

const HOJE = "2026-08-19"

function emp(over: Partial<Empresa> = {}): Empresa {
  return { id: over.id || "1", classificacao: "Prata", etapa: "Mapeada", ...over }
}

describe("link de inscrição", () => {
  it("linkDaEmpresa apara espaços e trata vazio", () => {
    expect(linkDaEmpresa(emp({ linkInscricao: "  http://x  " }))).toBe("http://x")
    expect(linkDaEmpresa(emp())).toBe("")
    expect(linkDaEmpresa(null)).toBe("")
  })

  it("linkDefasado quando o dono do link não é mais o consultor", () => {
    expect(linkDefasado(emp({ linkInscricao: "u", linkConsultor: "Ana", consultor: "Ana" }))).toBe(false)
    expect(linkDefasado(emp({ linkInscricao: "u", linkConsultor: "Ana", consultor: "Bia" }))).toBe(true)
    expect(linkDefasado(emp({ linkConsultor: "Ana", consultor: "Bia" }))).toBe(false) // sem link
  })

  it("linkAtivo esconde link defasado", () => {
    expect(linkAtivo(emp({ linkInscricao: "u", linkConsultor: "Ana", consultor: "Ana" }))).toBe("u")
    expect(linkAtivo(emp({ linkInscricao: "u", linkConsultor: "Ana", consultor: "Bia" }))).toBe("")
  })
})

describe("saudeConvenio", () => {
  it("não cadastrado quando não há convênio ativo", () => {
    expect(saudeConvenio(emp(), HOJE).nivel).toBe("pendente")
    expect(saudeConvenio(emp({ convenio: { ativo: false } }), HOJE).nivel).toBe("pendente")
  })

  it("respeita status encerrado e suspenso", () => {
    expect(saudeConvenio(emp({ convenio: { ativo: true, status: "Encerrado" } }), HOJE).nivel).toBe("encerrado")
    expect(saudeConvenio(emp({ convenio: { ativo: true, status: "Suspenso" } }), HOJE).nivel).toBe("alerta")
  })

  it("convênio antigo sem matrícula é vazio (crítico)", () => {
    const cv = { ativo: true, status: "Ativo", dataInicio: somarDias(HOJE, -120), matriculasAcademicas: "0" }
    expect(saudeConvenio(emp({ convenio: cv }), HOJE).nivel).toBe("vazio")
  })

  it("convênio recente sem matrícula é novo", () => {
    const cv = { ativo: true, status: "Ativo", dataInicio: somarDias(HOJE, -10), matriculasAcademicas: "0" }
    expect(saudeConvenio(emp({ convenio: cv }), HOJE).nivel).toBe("novo")
  })

  it("com matrícula e sem divulgar há muito tempo vira alerta", () => {
    const cv = { ativo: true, status: "Ativo", dataInicio: somarDias(HOJE, -200), matriculasAcademicas: "5", ultimaDivulgacao: somarDias(HOJE, -130) }
    expect(saudeConvenio(emp({ convenio: cv }), HOJE).nivel).toBe("alerta")
  })

  it("com matrícula e divulgação recente é ok", () => {
    const cv = { ativo: true, status: "Ativo", dataInicio: somarDias(HOJE, -200), matriculasAcademicas: "5", ultimaDivulgacao: somarDias(HOJE, -10) }
    expect(saudeConvenio(emp({ convenio: cv }), HOJE).nivel).toBe("ok")
  })
})

describe("construirFila", () => {
  it("ignora empresas sem potencial, inativas e em etapas encerradas", () => {
    const fila = construirFila(
      [
        emp({ id: "a", classificacao: "Sem potencial" }),
        emp({ id: "b", classificacao: "Inativa" }),
        emp({ id: "c", etapa: "Perdida" }),
      ],
      HOJE,
    )
    expect(fila).toHaveLength(0)
  })

  it("conveniada sem link ativo gera item crítico de maior peso", () => {
    const [item] = construirFila(
      [emp({ id: "x", etapa: "Conveniada", convenio: { ativo: true, status: "Ativo", dataInicio: somarDias(HOJE, -5), matriculasAcademicas: "3", ultimaDivulgacao: HOJE } })],
      HOJE,
    )
    expect(item.nivel).toBe("critico")
    expect(item.motivos.some((m) => m.includes("sem link de inscrição"))).toBe(true)
  })

  it("acumula motivos por empresa e mantém o maior peso/nível", () => {
    const e = emp({
      id: "y",
      classificacao: "Ouro",
      etapa: "Proposta enviada",
      dataProximaAcao: somarDias(HOJE, -3), // follow-up atrasado (crítico)
      ultimoContato: somarDias(HOJE, -40), // Ouro > 15 dias (crítico)
    })
    const [item] = construirFila([e], HOJE)
    expect(item.motivos.length).toBeGreaterThan(1)
    expect(item.nivel).toBe("critico")
  })

  it("ordena por peso decrescente", () => {
    const critico = emp({ id: "c1", classificacao: "Ouro", dataProximaAcao: somarDias(HOJE, -10) })
    const leve = emp({ id: "l1", classificacao: "Prata" }) // só "sem próximo passo" (peso 40)
    const fila = construirFila([leve, critico], HOJE)
    expect(fila[0].empresa.id).toBe("c1")
    expect(fila[0].peso).toBeGreaterThan(fila[1].peso)
  })

  it("empresa sem próximo passo e nunca contatada aparece como atenção", () => {
    const [item] = construirFila([emp({ id: "z", classificacao: "Bronze" })], HOJE)
    expect(item.nivel).toBe("atencao")
    expect(item.motivos).toContain("Sem próximo passo definido")
    expect(item.motivos).toContain("Nunca contatada")
  })
})
