import "server-only"
import { createHash } from "node:crypto"

/**
 * Camada de geocoding server-only (Mapbox Geocoding v6).
 *
 * Resolução de token: prefere MAPBOX_SECRET_TOKEN (idealmente sk...., ou um
 * pk.... sem restrição de URL). Se ausente OU se a chamada falhar com 401/403
 * (token sem escopo/restrito), cai para NEXT_PUBLIC_MAPBOX_TOKEN — que já é
 * público, então não vaza nenhum segredo novo. Nunca importe este módulo em
 * código de cliente ("server-only" quebra o build se tentarem).
 */

const GEOCODE_URL = "https://api.mapbox.com/search/geocode/v6/forward"

// Região Metropolitana de Campinas — usada como viés de proximidade e bbox.
const RMC_PROXIMITY = "-47.0626,-22.9099"
const RMC_BBOX = "-47.65,-23.25,-46.65,-22.55"

export type GeocodePrecision = "address" | "street" | "place" | "postcode" | "region" | "unknown"

export interface GeocodeInput {
  logradouro?: string | null
  numero?: string | null
  bairro?: string | null
  cidade?: string | null
  cep?: string | null
  uf?: string | null
}

export interface GeocodeResult {
  latitude: number
  longitude: number
  precision: GeocodePrecision
  /** 0..1 quando disponível (match_code.confidence do Mapbox v6). */
  confidence: number | null
  /** endereço normalizado retornado pelo Mapbox. */
  formatted: string | null
}

/** Monta a string de busca a partir dos campos de endereço. */
export function montarEndereco(i: GeocodeInput): string {
  const partes = [
    [i.logradouro, i.numero].filter(Boolean).join(", "),
    i.bairro,
    i.cidade,
    i.uf ?? "SP",
    i.cep,
  ].filter((p) => p && String(p).trim().length > 0)
  return partes.join(", ")
}

/** Hash estável dos campos de endereço — chave de cache para evitar re-geocoding. */
export function hashEndereco(i: GeocodeInput): string {
  return createHash("sha1").update(montarEndereco(i).toLowerCase()).digest("hex")
}

/** true quando há o mínimo para geocodificar (logradouro OU cidade OU cep). */
export function temEnderecoGeocodificavel(i: GeocodeInput): boolean {
  return Boolean(
    (i.logradouro && i.logradouro.trim()) ||
      (i.cidade && i.cidade.trim()) ||
      (i.cep && i.cep.trim()),
  )
}

function mapearPrecisao(featureType: string | undefined): GeocodePrecision {
  switch (featureType) {
    case "address":
      return "address"
    case "street":
      return "street"
    case "place":
    case "locality":
    case "neighborhood":
      return "place"
    case "postcode":
      return "postcode"
    case "region":
    case "district":
      return "region"
    default:
      return "unknown"
  }
}

async function chamarMapbox(query: string, token: string): Promise<Response> {
  const url = new URL(GEOCODE_URL)
  url.searchParams.set("q", query)
  url.searchParams.set("country", "br")
  url.searchParams.set("language", "pt")
  url.searchParams.set("limit", "1")
  url.searchParams.set("proximity", RMC_PROXIMITY)
  url.searchParams.set("bbox", RMC_BBOX)
  url.searchParams.set("access_token", token)
  return fetch(url, { headers: { "Content-Type": "application/json" } })
}

/**
 * Geocodifica um endereço. Retorna null quando não há endereço suficiente,
 * quando o Mapbox não encontra resultado, ou quando nenhum token funciona.
 * Nunca lança — o chamador (Server Action) decide como reportar.
 */
export async function geocodificar(input: GeocodeInput): Promise<GeocodeResult | null> {
  if (!temEnderecoGeocodificavel(input)) return null
  const query = montarEndereco(input)
  if (!query) return null

  const secret = process.env.MAPBOX_SECRET_TOKEN?.trim()
  const publico = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim()
  const tokens = [secret, publico].filter((t): t is string => Boolean(t))
  if (tokens.length === 0) {
    console.log("[v0] geocoding: nenhum token Mapbox configurado")
    return null
  }

  for (const token of tokens) {
    let res: Response
    try {
      res = await chamarMapbox(query, token)
    } catch (e) {
      console.log("[v0] geocoding: erro de rede", (e as Error).message)
      continue
    }
    // token sem escopo/restrito → tenta o próximo
    if (res.status === 401 || res.status === 403) {
      console.log("[v0] geocoding: token rejeitado (", res.status, ") — tentando fallback")
      continue
    }
    if (res.status === 429) {
      console.log("[v0] geocoding: rate limit (429)")
      return null
    }
    if (!res.ok) {
      console.log("[v0] geocoding: status inesperado", res.status)
      continue
    }
    const data = (await res.json()) as {
      features?: Array<{
        geometry?: { coordinates?: [number, number] }
        properties?: {
          feature_type?: string
          full_address?: string
          match_code?: { confidence?: string }
        }
      }>
    }
    const f = data.features?.[0]
    const coords = f?.geometry?.coordinates
    if (!coords || coords.length !== 2) return null
    const conf = f?.properties?.match_code?.confidence
    const confMap: Record<string, number> = { exact: 1, high: 0.85, medium: 0.6, low: 0.3 }
    return {
      longitude: coords[0],
      latitude: coords[1],
      precision: mapearPrecisao(f?.properties?.feature_type),
      confidence: conf ? (confMap[conf] ?? null) : null,
      formatted: f?.properties?.full_address ?? null,
    }
  }
  return null
}
