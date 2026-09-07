import { describe, it, expect } from "vitest"
import {
  inicioSemanaComercial,
  fimSemanaComercial,
  semanasNoIntervalo,
  calcularAderencia,
  semanaAtingida,
  apurarSupervest,
  calcularProgresso,
  mensagemMetaSemanal,
  type SemanaAderencia,
} from "./goals"

/* datas puras interpretadas como meia-noite UTC */
function diaSemanaISO(iso: string): number {
  return new Date(`${iso}T00:00:00.000Z`).getUTCDay()
}

describe("semana comercial (segunda→domingo, SP UTC−3)", () => {
  it("início da semana é sempre uma segunda-feira", () => {
    const inicio = inicioSemanaComercial(new Date("2026-08-19T15:00:00.000Z")) // quarta
    expect(diaSemanaISO(inicio)).toBe(1)
  })

  it("fim da semana é o domingo (início + 6 dias)", () => {
    const inicio = inicioSemanaComercial(new Date("2026-08-19T15:00:00.000Z"))
    const fim = fimSemanaComercial(inicio)
    expect(diaSemanaISO(fim)).toBe(0)
    expect(new Date(`${fim}T00:00:00Z`).getTime() - new Date(`${inicio}T00:00:00Z`).getTime()).toBe(6 * 86400000)
  })

  it("semanasNoIntervalo devolve segundas espaçadas de 7 dias", () => {
    const semanas = semanasNoIntervalo("2026-08-01", "2026-08-31")
    expect(semanas.every((s) => diaSemanaISO(s) === 1)).toBe(true)
    for (let i = 1; i < semanas.length; i++) {
      const delta = new Date(`${semanas[i]}T00:00:00Z`).getTime() - new Date(`${semanas[i - 1]}T00:00:00Z`).getTime()
      expect(delta).toBe(7 * 86400000)
    }
  })
})

describe("aderência de campo", () => {
  function semana(over: Partial<SemanaAderencia>): SemanaAderencia {
    return {
      weekStart: over.weekStart || "2026-08-03",
      appliedTarget: over.appliedTarget ?? 3,
      completedActions: over.completedActions ?? 0,
      achieved: over.achieved ?? false,
      applicable: over.applicable ?? true,
      exceptionReason: over.exceptionReason ?? null,
    }
  }

  it("cenário canônico 0,0,0,12 (alvo 3) → 25%", () => {
    const semanas = [0, 0, 0, 12].map((c) =>
      semana({ completedActions: c, achieved: semanaAtingida(c, 3) }),
    )
    const r = calcularAderencia(semanas)
    expect(r.semanasAplicaveis).toBe(4)
    expect(r.semanasAtingidas).toBe(1)
    expect(r.aderenciaPct).toBe(25)
  })

  it("semana em exceção sai do denominador", () => {
    const semanas = [
      semana({ completedActions: 3, achieved: true }),
      semana({ applicable: false, exceptionReason: "feriado" }),
      semana({ completedActions: 0, achieved: false }),
    ]
    const r = calcularAderencia(semanas)
    expect(r.semanasAplicaveis).toBe(2)
    expect(r.semanasAtingidas).toBe(1)
    expect(r.semanasExcecao).toBe(1)
    expect(r.aderenciaPct).toBe(50)
  })

  it("excesso não compensa déficit (semana batida conta 1, não mais)", () => {
    const semanas = [
      semana({ completedActions: 100, achieved: semanaAtingida(100, 3) }),
      semana({ completedActions: 0, achieved: semanaAtingida(0, 3) }),
    ]
    const r = calcularAderencia(semanas)
    expect(r.aderenciaPct).toBe(50)
  })

  it("todas em exceção → 0% e denominador zero", () => {
    const r = calcularAderencia([semana({ applicable: false }), semana({ applicable: false })])
    expect(r.semanasAplicaveis).toBe(0)
    expect(r.aderenciaPct).toBe(0)
  })
})

describe("anti-dupla-contagem SuperVest", () => {
  it("outros canais = oficial − atribuídas", () => {
    const r = apurarSupervest(100, 40, 30)
    expect(r.outrosCanais).toBe(30)
    expect(r.inconsistente).toBe(false)
  })

  it("atribuídas acima do oficial marca inconsistência", () => {
    const r = apurarSupervest(50, 40, 30)
    expect(r.outrosCanais).toBe(-20)
    expect(r.inconsistente).toBe(true)
  })
})

describe("progresso de meta", () => {
  it("faltante nunca é negativo e o excesso aparece no percentual", () => {
    const r = calcularProgresso(10, 13)
    expect(r.faltante).toBe(0)
    expect(r.atingimentoPct).toBe(130)
  })

  it("alvo zero não divide por zero", () => {
    expect(calcularProgresso(0, 5).atingimentoPct).toBe(0)
  })
})

describe("mensagem escalonada da meta semanal", () => {
  it("meta batida devolve tom ok", () => {
    expect(mensagemMetaSemanal(5, 3).tom).toBe("ok")
  })
  it("sexta-feira com déficit é crítico", () => {
    // 2026-08-21 é uma sexta-feira
    expect(mensagemMetaSemanal(1, 3, new Date("2026-08-21T15:00:00.000Z")).tom).toBe("critico")
  })
  it("segunda-feira com déficit é apenas informativo", () => {
    // 2026-08-17 é uma segunda-feira
    expect(mensagemMetaSemanal(1, 3, new Date("2026-08-17T15:00:00.000Z")).tom).toBe("info")
  })
})
