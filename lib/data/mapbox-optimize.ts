import "server-only"
import { tokensMapbox, esperar } from "./mapbox-token"

/**
 * Núcleo da Mapbox Optimization API v1 (síncrona), server-only.
 *
 * DECISÕES DE ARQUITETURA (ver justificativa na resposta):
 *  1. Limite de 12 coordenadas por requisição (origem + destino + até 10
 *     paradas). Estouro NÃO é truncado em silêncio: retornamos excedeuLimite
 *     para a UI avisar e oferecer dividir.
 *  2. A v1 síncrona NÃO suporta time windows. Para compromissos com hora fixa
 *     usamos a abordagem de ÂNCORA: os pontos fixos são ordenados por horário e
 *     viram waypoints obrigatórios; as visitas livres são distribuídas ao trecho
 *     mais próximo e cada trecho é otimizado separadamente pela Mapbox. Assim a
 *     ordem real de cada trecho é sempre da API — nunca por distância em linha
 *     reta (a geodésica só serve para distribuir, não para ordenar).
 */

export const LIMITE_COORDENADAS = 12

export interface Coord {
  lng: number
  lat: number
}

export interface ParadaPlano {
  id: string
  coord: Coord
  fixedTime?: string | null // "HH:MM"
  visitMinutes?: number | null
}

export interface ResultadoOtimizacao {
  ok: boolean
  erro?: string
  excedeuLimite?: boolean
  otimizado: boolean
  ordem: string[] // ids das paradas na ordem final
  etaPorParada: Record<string, string> // id -> "HH:MM"
  totalDistanceM: number
  totalDurationS: number
}

interface RespostaTrip {
  code?: string
  waypoints?: Array<{ waypoint_index: number; location: [number, number] }>
  trips?: Array<{ distance: number; duration: number; legs?: Array<{ distance: number; duration: number }> }>
}

/* ─── util de horário ─── */
function hhmmParaMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}
function minParaHHMM(min: number): string {
  const t = ((Math.round(min) % 1440) + 1440) % 1440
  const h = Math.floor(t / 60)
  const m = t % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}
export function distanciaGeodesicaKm(a: Coord, b: Coord): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Uma chamada à Optimization API para uma lista ordenada de coordenadas
 * (primeira = origem, última = destino). Retorna a ordem otimizada dos índices
 * intermediários e as durações/distâncias. Retry com backoff; fallback de
 * perfil driving-traffic → driving e fallback de token.
 */
async function chamarOptimization(
  coords: Coord[],
): Promise<{ ordemIdx: number[]; legs: Array<{ distance: number; duration: number }>; distance: number; duration: number } | null> {
  if (coords.length < 2 || coords.length > LIMITE_COORDENADAS) return null
  const tokens = tokensMapbox()
  if (tokens.length === 0) {
    console.log("[v0] optimize: nenhum token Mapbox")
    return null
  }
  const perfis = ["mapbox/driving-traffic", "mapbox/driving"]
  const path = coords.map((c) => `${c.lng},${c.lat}`).join(";")

  for (const perfil of perfis) {
    for (const token of tokens) {
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        const url = new URL(`https://api.mapbox.com/optimized-trips/v1/${perfil}/${path}`)
        url.searchParams.set("source", "first")
        url.searchParams.set("destination", "last")
        url.searchParams.set("roundtrip", "false")
        url.searchParams.set("annotations", "distance,duration")
        url.searchParams.set("overview", "false")
        url.searchParams.set("access_token", token)
        let res: Response
        try {
          res = await fetch(url)
        } catch (e) {
          console.log("[v0] optimize: rede", (e as Error).message)
          await esperar(300 * (tentativa + 1))
          continue
        }
        if (res.status === 401 || res.status === 403) break // token ruim → próximo token
        if (res.status === 429 || res.status >= 500) {
          await esperar(400 * (tentativa + 1)) // backoff
          continue
        }
        if (!res.ok) break
        const data = (await res.json()) as RespostaTrip
        if (data.code !== "Ok" || !data.waypoints || !data.trips?.[0]) break
        const trip = data.trips[0]
        // waypoint_index dá a posição de cada coordenada de ENTRADA na rota otimizada
        const ordemIdx = data.waypoints
          .map((w, i) => ({ i, pos: w.waypoint_index }))
          .sort((a, b) => a.pos - b.pos)
          .map((x) => x.i)
        return {
          ordemIdx,
          legs: trip.legs ?? [],
          distance: Math.round(trip.distance),
          duration: Math.round(trip.duration),
        }
      }
    }
  }
  return null
}

/**
 * Planeja a rota completa. Sem paradas fixas: uma única otimização. Com paradas
 * fixas: segmenta por âncora (ordem de horário) e otimiza cada trecho.
 * Calcula ETA acumulado a partir de departureTime, somando visitMinutes e
 * respeitando fixedTime como piso (espera se chegar antes).
 */
export async function planejarRota(params: {
  origem: Coord
  destino: Coord
  paradas: ParadaPlano[]
  avgVisitMinutes: number
  departureTime?: string | null
}): Promise<ResultadoOtimizacao> {
  const { origem, destino, paradas, avgVisitMinutes } = params
  const vazio: ResultadoOtimizacao = {
    ok: true,
    otimizado: false,
    ordem: paradas.map((p) => p.id),
    etaPorParada: {},
    totalDistanceM: 0,
    totalDurationS: 0,
  }
  if (paradas.length === 0) return vazio

  const fixas = paradas.filter((p) => p.fixedTime).sort((a, b) => hhmmParaMin(a.fixedTime!) - hhmmParaMin(b.fixedTime!))
  const livres = paradas.filter((p) => !p.fixedTime)

  // Monta os "trechos": cada trecho tem origem, destino e as livres atribuídas.
  // Sem fixas: um único trecho origem→destino com todas as livres.
  type Trecho = { de: Coord; ate: Coord; livres: ParadaPlano[]; ancoraFinal?: ParadaPlano }
  const trechos: Trecho[] = []
  if (fixas.length === 0) {
    trechos.push({ de: origem, ate: destino, livres: [...livres] })
  } else {
    // pontos de junção: origem, cada fixa (na ordem de horário), destino
    const juncoes: Coord[] = [origem, ...fixas.map((f) => f.coord), destino]
    // distribui cada livre ao trecho cujo ponto médio geodésico é mais próximo
    const baldes: ParadaPlano[][] = Array.from({ length: juncoes.length - 1 }, () => [])
    for (const l of livres) {
      let melhor = 0
      let melhorD = Infinity
      for (let s = 0; s < juncoes.length - 1; s++) {
        const mid = { lng: (juncoes[s].lng + juncoes[s + 1].lng) / 2, lat: (juncoes[s].lat + juncoes[s + 1].lat) / 2 }
        const d = distanciaGeodesicaKm(l.coord, mid)
        if (d < melhorD) {
          melhorD = d
          melhor = s
        }
      }
      baldes[melhor].push(l)
    }
    for (let s = 0; s < juncoes.length - 1; s++) {
      trechos.push({
        de: juncoes[s],
        ate: juncoes[s + 1],
        livres: baldes[s],
        ancoraFinal: s < fixas.length ? fixas[s] : undefined,
      })
    }
  }

  // Verifica limite por trecho: coords = de + livres + ate
  for (const t of trechos) {
    if (2 + t.livres.length > LIMITE_COORDENADAS) {
      return {
        ...vazio,
        excedeuLimite: true,
        erro: `Um trecho tem ${t.livres.length} paradas livres, acima do limite de ${LIMITE_COORDENADAS - 2} por trecho. Divida a rota em dois dias ou remova paradas.`,
      }
    }
  }

  // Otimiza trecho a trecho e concatena
  const ordemFinal: string[] = []
  const eta: Record<string, string> = {}
  let totalDist = 0
  let totalDur = 0
  let relogio = params.departureTime ? hhmmParaMin(params.departureTime) : 8 * 60
  let algumOtimizado = false

  for (const t of trechos) {
    const coords = [t.de, ...t.livres.map((l) => l.coord), t.ate]
    let ordemLivres = t.livres // fallback: ordem de entrada
    let legs: Array<{ distance: number; duration: number }> = []

    if (t.livres.length >= 1) {
      const r = await chamarOptimization(coords)
      if (r) {
        algumOtimizado = true
        // r.ordemIdx é sobre [0=de, 1..n=livres, n+1=ate]; extrai só as livres na nova ordem
        const idxLivres = r.ordemIdx.filter((i) => i > 0 && i <= t.livres.length).map((i) => i - 1)
        ordemLivres = idxLivres.map((i) => t.livres[i])
        legs = r.legs
        totalDist += r.distance
        totalDur += r.duration
      } else {
        // API falhou neste trecho: mantém ordem manual (sem alegar otimização)
        legs = []
      }
    } else {
      // trecho sem livres: mede o deslocamento direto de→ate para compor ETA/total
      const r = await chamarOptimization([t.de, t.ate])
      if (r) {
        legs = r.legs
        totalDist += r.distance
        totalDur += r.duration
      }
    }

    // ETA acumulado: percorre as paradas livres do trecho na ordem definida
    for (let k = 0; k < ordemLivres.length; k++) {
      const legSeg = legs[k]?.duration ?? 0
      relogio += legSeg / 60
      const parada = ordemLivres[k]
      eta[parada.id] = minParaHHMM(relogio)
      relogio += parada.visitMinutes ?? avgVisitMinutes
      ordemFinal.push(parada.id)
    }
    // chegada na âncora final do trecho (parada fixa)
    if (t.ancoraFinal) {
      const legAteAncora = legs[ordemLivres.length]?.duration ?? 0
      relogio += legAteAncora / 60
      const alvo = hhmmParaMin(t.ancoraFinal.fixedTime!)
      if (relogio < alvo) relogio = alvo // espera até o compromisso
      eta[t.ancoraFinal.id] = minParaHHMM(relogio)
      relogio += t.ancoraFinal.visitMinutes ?? avgVisitMinutes
      ordemFinal.push(t.ancoraFinal.id)
    }
  }

  return {
    ok: true,
    otimizado: algumOtimizado,
    ordem: ordemFinal.length ? ordemFinal : paradas.map((p) => p.id),
    etaPorParada: eta,
    totalDistanceM: totalDist,
    totalDurationS: totalDur,
  }
}
