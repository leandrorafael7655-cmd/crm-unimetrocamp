import "server-only"
import { createClient } from "@/lib/supabase/server"
import { getActor } from "@/lib/auth/guards"

export interface MeuEnderecoRota {
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  cep: string
  lat: number
  lng: number
  label: string
}

export async function obterMeuEnderecoRota(): Promise<MeuEnderecoRota | null> {
  const actor = await getActor()
  if (!actor) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from("route_user_preferences")
    .select("home_logradouro, home_numero, home_complemento, home_bairro, home_cidade, home_cep, home_latitude, home_longitude")
    .eq("user_id", actor.id)
    .maybeSingle()

  if (!data || data.home_latitude == null || data.home_longitude == null) return null

  const logradouro = data.home_logradouro ?? ""
  const numero = data.home_numero ?? ""
  const complemento = data.home_complemento ?? ""
  const bairro = data.home_bairro ?? ""
  const cidade = data.home_cidade ?? ""
  const cep = data.home_cep ?? ""
  const partes = [logradouro, numero, bairro, cidade].filter(Boolean)

  return {
    logradouro,
    numero,
    complemento,
    bairro,
    cidade,
    cep,
    lat: data.home_latitude,
    lng: data.home_longitude,
    label: partes.length ? `Meu endereço · ${partes.join(", ")}` : "Meu endereço",
  }
}
