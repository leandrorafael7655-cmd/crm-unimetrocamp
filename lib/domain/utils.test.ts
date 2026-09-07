import { describe, it, expect } from "vitest"
import {
  diffDias, brData, brDataLonga, somarDias, num, meses, slug,
  soDigitos, mascaraCNPJ, cnpjValido, completarCNPJ, hojeISO, uid,
} from "./utils"

describe("datas", () => {
  it("hojeISO devolve YYYY-MM-DD", () => {
    expect(hojeISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("diffDias conta dias inteiros entre ISOs", () => {
    expect(diffDias("2026-01-01", "2026-01-11")).toBe(10)
    expect(diffDias("2026-01-11", "2026-01-01")).toBe(-10)
    expect(diffDias("2026-01-01", "2026-01-01")).toBe(0)
  })

  it("diffDias é null quando falta alguma data", () => {
    expect(diffDias("", "2026-01-01")).toBeNull()
    expect(diffDias("2026-01-01", "")).toBeNull()
  })

  it("diffDias atravessa virada de mês e ano", () => {
    expect(diffDias("2025-12-31", "2026-01-01")).toBe(1)
    expect(diffDias("2026-02-28", "2026-03-01")).toBe(1) // 2026 não bissexto
  })

  it("brData e brDataLonga formatam e tratam vazio", () => {
    expect(brData("2026-08-19")).toBe("19/08")
    expect(brDataLonga("2026-08-19")).toBe("19/08/2026")
    expect(brData("")).toBe("—")
    expect(brDataLonga("")).toBe("—")
  })

  it("somarDias soma e subtrai preservando ISO", () => {
    expect(somarDias("2026-01-01", 10)).toBe("2026-01-11")
    expect(somarDias("2026-01-01", -1)).toBe("2025-12-31")
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28")
  })
})

describe("num e meses", () => {
  it("num coage com segurança para número", () => {
    expect(num("5")).toBe(5)
    expect(num("")).toBe(0)
    expect(num("abc")).toBe(0)
    expect(num(null)).toBe(0)
    expect(num(undefined)).toBe(0)
    expect(num(3.5)).toBe(3.5)
  })

  it("meses mostra dias abaixo de 60 e meses acima", () => {
    expect(meses(null)).toBe("—")
    expect(meses(10)).toBe("10 dias")
    expect(meses(59)).toBe("59 dias")
    expect(meses(60)).toBe("2 meses")
    expect(meses(90)).toBe("3 meses")
  })
})

describe("slug", () => {
  it("remove acentos, espaços e limita a 40 caracteres", () => {
    expect(slug("Ação Comercial")).toBe("acao-comercial")
    expect(slug("  Olá,   Mundo!  ")).toBe("ola-mundo")
    expect(slug("São Paulo / SP")).toBe("sao-paulo-sp")
    expect(slug("").length).toBe(0)
    expect(slug("a".repeat(60)).length).toBe(40)
  })
})

describe("CNPJ", () => {
  it("soDigitos remove tudo que não é dígito", () => {
    expect(soDigitos("11.222.333/0001-81")).toBe("11222333000181")
    expect(soDigitos("abc")).toBe("")
  })

  it("mascaraCNPJ aplica a máscara progressivamente", () => {
    expect(mascaraCNPJ("11222333000181")).toBe("11.222.333/0001-81")
  })

  it("completarCNPJ gera DVs válidos a partir de 12 dígitos", () => {
    const completo = completarCNPJ("112223330001")
    expect(cnpjValido(completo)).toBe(true)
    expect(completo).toMatch(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/)
  })

  it("cnpjValido rejeita comprimento errado e dígitos repetidos", () => {
    expect(cnpjValido("11222333000180")).toBe(false) // DV errado
    expect(cnpjValido("00000000000000")).toBe(false)
    expect(cnpjValido("123")).toBe(false)
    expect(cnpjValido("")).toBe(false)
  })

  it("completarCNPJ e cnpjValido são consistentes para várias bases", () => {
    for (const base of ["112233440001", "223344550001", "990011220001"]) {
      expect(cnpjValido(completarCNPJ(base))).toBe(true)
    }
  })
})

describe("uid", () => {
  it("gera identificadores únicos no formato UUID", () => {
    const a = uid()
    const b = uid()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  })
})
