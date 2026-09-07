import { describe, it, expect } from "vitest"
import { avaliarAuthCron, comparacaoConstante } from "./cron-auth"

describe("comparacaoConstante", () => {
  it("é verdadeira para strings idênticas", () => {
    expect(comparacaoConstante("Bearer abc123", "Bearer abc123")).toBe(true)
  })

  it("é falsa para strings diferentes de mesmo tamanho", () => {
    expect(comparacaoConstante("Bearer abc123", "Bearer xyz789")).toBe(false)
  })

  it("NÃO lança e retorna falso para comprimentos diferentes (não vaza tamanho)", () => {
    // Sem o hash SHA-256, timingSafeEqual lançaria RangeError aqui.
    expect(() => comparacaoConstante("x", "Bearer segredo-bem-mais-longo")).not.toThrow()
    expect(comparacaoConstante("x", "Bearer segredo-bem-mais-longo")).toBe(false)
  })
})

describe("avaliarAuthCron — separação dos dois casos de recusa", () => {
  const secret = "s3gr3d0-de-teste"

  it("CRON_SECRET ausente → 503 (má configuração do servidor)", () => {
    expect(avaliarAuthCron(undefined, `Bearer ${secret}`)).toEqual({
      autorizado: false,
      status: 503,
      error: "CRON_SECRET não configurado",
    })
    expect(avaliarAuthCron(null, `Bearer ${secret}`).autorizado).toBe(false)
    expect(avaliarAuthCron("", `Bearer ${secret}`)).toMatchObject({ status: 503 })
  })

  it("segredo presente mas header ausente → 401", () => {
    expect(avaliarAuthCron(secret, null)).toEqual({
      autorizado: false,
      status: 401,
      error: "unauthorized",
    })
  })

  it("segredo presente mas header errado → 401", () => {
    expect(avaliarAuthCron(secret, "Bearer outra-coisa")).toMatchObject({
      autorizado: false,
      status: 401,
    })
    expect(avaliarAuthCron(secret, secret)).toMatchObject({ status: 401 }) // sem prefixo "Bearer "
  })

  it("segredo presente e header correto → autorizado", () => {
    expect(avaliarAuthCron(secret, `Bearer ${secret}`)).toEqual({ autorizado: true })
  })

  it("prioriza 503 sobre 401 quando faltam segredo E header", () => {
    // Sem segredo, o problema é de configuração, não do chamador.
    expect(avaliarAuthCron(undefined, null)).toMatchObject({ status: 503 })
  })
})
