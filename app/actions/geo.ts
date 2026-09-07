"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireCan } from "@/lib/auth/guards"
import {
  geocodificar,
  hashEndereco,
  temEnderecoGeocodificavel,
  type GeocodeInput,
} from "@/lib/data/mapbox-geocode"

type Entidade = "empresa" | "escola"

interface LinhaGeo {
  id: string
  logradouro: string | null
  numero: string | null
  bairro: string | null
  cidade: string | null
  cep: string | null
  latitude: number | null
  geocode_hash: string | null
}

const TABELA: Record<Entidade, string> = { empresa: "companies", escola: "schools" }

function toInput(l: LinhaGeo): GeocodeInput {
  return {
    logradouro: l.logradouro,
    numero: l.numero,
    bairro: l.bairro,
    cidade: l.cidade,
    cep: l.cep,
    uf: "SP",
  }
}

export interface BackfillResultado {
  ok: boolean
  entidade: Entidade
  total: number
  geocodificados: number
  pulados: number
  falhas: number
  mensagem: string
}

/**
 * Backfill de geocoding para empresas OU escolas.
 * - Idempotente: pula linhas cujo hash de endereço não mudou (cache).
 * - Autorização: exige b2b.write (empresa) ou hs.write (escola).
 * - Nunca lança para a UI — retorna um resumo estruturado.
 * - `limite` protege contra rajadas grandes (default 50 por chamada).
 */
export async function backfillGeocoding(
  entidade: Entidade,
  opcoes?: { limite?: number; forcar?: boolean },
): Promise<BackfillResultado> {
  const limite = Math.min(Math.max(opcoes?.limite ?? 50, 1), 200)
  const forcar = opcoes?.forcar ?? false

  const base: BackfillResultado = {
    ok: false,
    entidade,
    total: 0,
    geocodificados: 0,
    pulados: 0,
    falhas: 0,
    mensagem: "",
  }

  try {
    await requireCan(entidade === "empresa" ? "b2b.write" : "hs.write")
  } catch (e) {
    return { ...base, mensagem: (e as Error).message }
  }

  const supabase = await createClient()
  const tabela = TABELA[entidade]

  // seleciona linhas sem coordenada OU sem hash (a re-geocodificar), com endereço.
  let q = supabase
    .from(tabela)
    .select("id, logradouro, numero, bairro, cidade, cep, latitude, geocode_hash")
    .limit(limite)
  if (!forcar) q = q.is("latitude", null)

  const { data, error } = await q
  if (error) return { ...base, mensagem: `Erro ao ler ${tabela}: ${error.message}` }

  const linhas = (data ?? []) as LinhaGeo[]
  base.total = linhas.length

  for (const l of linhas) {
    const input = toInput(l)
    if (!temEnderecoGeocodificavel(input)) {
      base.pulados++
      continue
    }
    const novoHash = hashEndereco(input)
    if (!forcar && l.geocode_hash === novoHash && l.latitude != null) {
      base.pulados++
      continue
    }

    const r = await geocodificar(input)
    if (!r) {
      base.falhas++
      continue
    }

    const { error: upErr } = await supabase
      .from(tabela)
      .update({
        latitude: r.latitude,
        longitude: r.longitude,
        geocode_precision: r.precision,
        geocoded_at: new Date().toISOString(),
        geocode_hash: novoHash,
      })
      .eq("id", l.id)

    if (upErr) base.falhas++
    else base.geocodificados++
  }

  base.ok = true
  base.mensagem = `${base.geocodificados} geocodificados, ${base.pulados} pulados, ${base.falhas} falhas de ${base.total}.`
  revalidatePath("/mapa")
  return base
}

/**
 * Geocodifica UMA entidade específica (ex.: após editar o endereço no CRM).
 * Retorna as coordenadas ou null. Autorização por permissão de escrita.
 */
export async function geocodificarEntidade(
  entidade: Entidade,
  id: string,
): Promise<{ ok: boolean; latitude?: number; longitude?: number; mensagem: string }> {
  try {
    await requireCan(entidade === "empresa" ? "b2b.write" : "hs.write")
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message }
  }

  const supabase = await createClient()
  const tabela = TABELA[entidade]
  const { data, error } = await supabase
    .from(tabela)
    .select("id, logradouro, numero, bairro, cidade, cep, latitude, geocode_hash")
    .eq("id", id)
    .maybeSingle()

  if (error || !data) return { ok: false, mensagem: "Registro não encontrado." }

  const input = toInput(data as LinhaGeo)
  if (!temEnderecoGeocodificavel(input)) {
    return { ok: false, mensagem: "Endereço insuficiente para geocodificar." }
  }

  const r = await geocodificar(input)
  if (!r) return { ok: false, mensagem: "Não foi possível localizar o endereço." }

  const { error: upErr } = await supabase
    .from(tabela)
    .update({
      latitude: r.latitude,
      longitude: r.longitude,
      geocode_precision: r.precision,
      geocoded_at: new Date().toISOString(),
      geocode_hash: hashEndereco(input),
    })
    .eq("id", id)

  if (upErr) return { ok: false, mensagem: `Erro ao salvar: ${upErr.message}` }
  revalidatePath("/mapa")
  return { ok: true, latitude: r.latitude, longitude: r.longitude, mensagem: "Localizado." }
}
