"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireCan } from "@/lib/auth/guards"
import { geocodificar, type GeocodeInput } from "@/lib/data/mapbox-geocode"
import { carregarPlano } from "@/lib/data/route-queries"
import type { MeuEnderecoRota } from "@/lib/data/route-preferences"

export interface MeuEnderecoInput {
  logradouro: string
  numero: string
  complemento?: string
  bairro?: string
  cidade: string
  cep?: string
}

export async function salvarMeuEnderecoAction(
  input: MeuEnderecoInput,
): Promise<{ ok: boolean; message: string; endereco?: MeuEnderecoRota }> {
  try {
    const actor = await requireCan("routes.plan")
    const logradouro = input.logradouro.trim()
    const numero = input.numero.trim()
    const complemento = (input.complemento ?? "").trim()
    const bairro = (input.bairro ?? "").trim()
    const cidade = input.cidade.trim()
    const cep = (input.cep ?? "").trim()

    if (!logradouro || !numero || !cidade) {
      return { ok: false, message: "Informe rua, número e cidade." }
    }

    const geoInput: GeocodeInput = {
      logradouro,
      numero,
      bairro,
      cidade,
      cep,
      uf: "SP",
    }
    const geo = await geocodificar(geoInput)
    if (!geo) {
      return { ok: false, message: "Não foi possível localizar esse endereço. Revise os dados e tente novamente." }
    }

    const supabase = await createClient()
    const { error } = await supabase.from("route_user_preferences").upsert(
      {
        user_id: actor.id,
        home_logradouro: logradouro,
        home_numero: numero,
        home_complemento: complemento || null,
        home_bairro: bairro || null,
        home_cidade: cidade,
        home_cep: cep || null,
        home_latitude: geo.latitude,
        home_longitude: geo.longitude,
        home_geocoded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )

    if (error) return { ok: false, message: `Erro ao salvar endereço: ${error.message}` }

    const partes = [logradouro, numero, bairro, cidade].filter(Boolean)
    const endereco: MeuEnderecoRota = {
      logradouro,
      numero,
      complemento,
      bairro,
      cidade,
      cep,
      lat: geo.latitude,
      lng: geo.longitude,
      label: `Meu endereço · ${partes.join(", ")}`,
    }

    revalidatePath("/mapa/rotas")
    return { ok: true, message: "Meu endereço salvo e localizado no mapa.", endereco }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

export async function carregarPlanoSalvoAction(id: string) {
  await requireCan("routes.plan")
  return carregarPlano(id)
}
