import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// server-only lança ao ser importado fora do bundle server; neutralizamos no teste.
vi.mock("server-only", () => ({}))
// Token fake para não depender de env, e "esperar" instantâneo para não atrasar retries.
vi.mock("./mapbox-token", () => ({
  tokensMapbox: () => ["tok_teste"],
  esperar: () => Promise.resolve(),
}))

import { planejarRota, distanciaGeodesicaKm, LIMITE_COORDENADAS, type ParadaPlano } from "./mapbox-optimize"

const ORIGEM = { lng: -47.06, lat: -22.9 }
const DESTINO = { lng: -47.06, lat: -22.9 }

/** Conta as coordenadas a partir da URL da Optimization API. */
function contarCoords(url: string): number {
  return url.split("?")[0].split("/").pop()!.split(";").length
}

/** Resposta genérica: ordem identidade, legs de 10min/3km cada. */
function respostaIdentidade(n: number) {
  const legs = Array.from({ length: n - 1 }, () => ({ distance: 3000, duration: 600 }))
  return {
    ok: true,
    status: 200,
    json: async () => ({
      code: "Ok",
      waypoints: Array.from({ length: n }, (_, i) => ({ waypoint_index: i, location: [0, 0] })),
      trips: [{ distance: 3000 * (n - 1), duration: 600 * (n - 1), legs }],
    }),
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("distanciaGeodesicaKm", () => {
  it("é zero para o mesmo ponto e positiva para pontos distintos", () => {
    expect(distanciaGeodesicaKm(ORIGEM, ORIGEM)).toBeCloseTo(0, 5)
    expect(distanciaGeodesicaKm(ORIGEM, { lng: -46.63, lat: -23.55 })).toBeGreaterThan(50)
  })
})

describe("planejarRota — sem paradas", () => {
  it("retorna vazio e não otimizado", async () => {
    const r = await planejarRota({ origem: ORIGEM, destino: DESTINO, paradas: [], avgVisitMinutes: 45 })
    expect(r.ok).toBe(true)
    expect(r.otimizado).toBe(false)
    expect(r.ordem).toEqual([])
  })
})

describe("planejarRota — otimização real (mock)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => respostaIdentidade(contarCoords(String(url)))),
    )
  })

  it("reordena as paradas livres pela ordem retornada pela API", async () => {
    // Sobrescreve o fetch para inverter as duas livres (waypoint_index 0,2,1,3).
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          code: "Ok",
          waypoints: [
            { waypoint_index: 0, location: [0, 0] }, // origem
            { waypoint_index: 2, location: [0, 0] }, // l1 → vai para o fim
            { waypoint_index: 1, location: [0, 0] }, // l2 → vai para o começo
            { waypoint_index: 3, location: [0, 0] }, // destino
          ],
          trips: [{ distance: 9000, duration: 1800, legs: [
            { distance: 3000, duration: 600 },
            { distance: 3000, duration: 600 },
            { distance: 3000, duration: 600 },
          ] }],
        }),
      })),
    )
    const paradas: ParadaPlano[] = [
      { id: "l1", coord: { lng: -47.05, lat: -22.91 } },
      { id: "l2", coord: { lng: -47.04, lat: -22.89 } },
    ]
    const r = await planejarRota({ origem: ORIGEM, destino: DESTINO, paradas, avgVisitMinutes: 30, departureTime: "08:00" })
    expect(r.otimizado).toBe(true)
    expect(r.ordem).toEqual(["l2", "l1"]) // inverteu conforme waypoint_index
    expect(r.totalDistanceM).toBe(9000)
    expect(Object.keys(r.etaPorParada)).toEqual(expect.arrayContaining(["l1", "l2"]))
  })

  it("ETA acumula deslocamento + tempo de visita a partir da saída", async () => {
    const paradas: ParadaPlano[] = [{ id: "p1", coord: { lng: -47.05, lat: -22.91 }, visitMinutes: 20 }]
    const r = await planejarRota({ origem: ORIGEM, destino: DESTINO, paradas, avgVisitMinutes: 45, departureTime: "08:00" })
    // leg origem→p1 = 600s = 10min → chega 08:10
    expect(r.etaPorParada["p1"]).toBe("08:10")
  })
})

describe("planejarRota — âncora de hora fixa", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => respostaIdentidade(contarCoords(String(url)))),
    )
  })

  it("respeita fixedTime como piso do ETA (espera se chegar antes)", async () => {
    const paradas: ParadaPlano[] = [
      { id: "livre", coord: { lng: -47.055, lat: -22.905 } },
      { id: "fixa", coord: { lng: -47.05, lat: -22.91 }, fixedTime: "14:00" },
    ]
    const r = await planejarRota({ origem: ORIGEM, destino: DESTINO, paradas, avgVisitMinutes: 30, departureTime: "08:00" })
    // chega muito antes das 14:00 → o ETA da parada fixa é exatamente o compromisso
    expect(r.etaPorParada["fixa"]).toBe("14:00")
    // a parada fixa é a última na ordem
    expect(r.ordem[r.ordem.length - 1]).toBe("fixa")
  })
})

describe("planejarRota — limites e falhas", () => {
  it("estouro do limite de coordenadas não trunca: sinaliza excedeuLimite", async () => {
    vi.stubGlobal("fetch", vi.fn())
    const paradas: ParadaPlano[] = Array.from({ length: LIMITE_COORDENADAS + 1 }, (_, i) => ({
      id: `p${i}`,
      coord: { lng: -47 - i * 0.01, lat: -22.9 - i * 0.01 },
    }))
    const r = await planejarRota({ origem: ORIGEM, destino: DESTINO, paradas, avgVisitMinutes: 45 })
    expect(r.excedeuLimite).toBe(true)
    expect(r.otimizado).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it("falha da API mantém a ordem manual sem alegar otimização", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
    const paradas: ParadaPlano[] = [
      { id: "a", coord: { lng: -47.05, lat: -22.91 } },
      { id: "b", coord: { lng: -47.04, lat: -22.89 } },
    ]
    const r = await planejarRota({ origem: ORIGEM, destino: DESTINO, paradas, avgVisitMinutes: 45 })
    expect(r.otimizado).toBe(false)
    expect(r.ordem).toEqual(["a", "b"]) // ordem de entrada preservada
  })
})
