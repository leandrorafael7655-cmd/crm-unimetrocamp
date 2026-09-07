import "server-only"
import { createClient } from "@/lib/supabase/server"
import { getActor, type ActorProfile } from "@/lib/auth/guards"
import { isManagerRole } from "@/lib/auth/guards"
import { distanciaGeodesicaKm, type Coord } from "./mapbox-optimize"

export interface PontoDisponivel {
  id: string
  tipo: "company" | "school"
  nome: string
  cidade: string | null
  bairro: string | null
  lat: number
  lng: number
  etapa: string | null
  classificacao: string | null
  dono: string | null
}

export interface ParadaCarregada {
  id: string
  entity_type: "company" | "school"
  entity_id: string
  sort_order: number
  fixed_time: string | null
  estimated_arrival: string | null
  visit_minutes: number | null
  notes: string | null
  nome: string
  cidade: string | null
  lat: number | null
  lng: number | null
}

export interface PlanoCarregado {
  id: string
  owner_id: string
  plan_date: string
  origin_label: string | null
  origin_lat: number | null
  origin_lng: number | null
  destination_label: string | null
  destination_lat: number | null
  destination_lng: number | null
  departure_time: string | null
  return_time: string | null
  avg_visit_minutes: number
  status: string
  optimized_at: string | null
  total_distance_m: number | null
  total_duration_s: number | null
  notes: string | null
  paradas: ParadaCarregada[]
}

export interface SugestaoProximidade {
  id: string
  tipo: "company" | "school"
  nome: string
  cidade: string | null
  lat: number
  lng: number
  distanciaKm: number
  motivo: string
}

/** Lista pontos geocodificados disponíveis para montar rota (carteira do ator; gerência vê todos). */
export async function pontosDisponiveis(busca?: string): Promise<PontoDisponivel[]> {
  const actor = await getActor()
  if (!actor) return []
  const supabase = await createClient()
  const gestor = isManagerRole(actor.role)
  const termo = (busca ?? "").trim()

   
  let qc: any = supabase
    .from("companies")
    .select("id, razao_social, nome_fantasia, cidade, bairro, latitude, longitude, etapa, classificacao, owner_id")
    .not("latitude", "is", null)
    .limit(200)
  if (!gestor) qc = qc.eq("owner_id", actor.id)
  if (termo) qc = qc.or(`razao_social.ilike.%${termo}%,nome_fantasia.ilike.%${termo}%`)

   
  let qs: any = supabase
    .from("schools")
    .select("id, name, cidade, bairro, latitude, longitude, relationship_stage, classification, primary_owner_id")
    .not("latitude", "is", null)
    .limit(200)
  if (!gestor) qs = qs.eq("primary_owner_id", actor.id)
  if (termo) qs = qs.ilike("name", `%${termo}%`)

  const [rc, rs] = await Promise.all([qc, qs])
  const empresas: PontoDisponivel[] = (rc.data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    tipo: "company" as const,
    nome: (r.nome_fantasia as string) || (r.razao_social as string) || "Empresa",
    cidade: (r.cidade as string) ?? null,
    bairro: (r.bairro as string) ?? null,
    lat: r.latitude as number,
    lng: r.longitude as number,
    etapa: (r.etapa as string) ?? null,
    classificacao: (r.classificacao as string) ?? null,
    dono: (r.owner_id as string) ?? null,
  }))
  const escolas: PontoDisponivel[] = (rs.data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    tipo: "school" as const,
    nome: (r.name as string) || "Escola",
    cidade: (r.cidade as string) ?? null,
    bairro: (r.bairro as string) ?? null,
    lat: r.latitude as number,
    lng: r.longitude as number,
    etapa: (r.relationship_stage as string) ?? null,
    classificacao: (r.classification as string) ?? null,
    dono: (r.primary_owner_id as string) ?? null,
  }))
  return [...empresas, ...escolas].sort((a, b) => a.nome.localeCompare(b.nome, "pt"))
}

/** Carrega um plano com paradas e detalhes das entidades (RLS decide o acesso). */
export async function carregarPlano(planId: string): Promise<PlanoCarregado | null> {
  const supabase = await createClient()
  const { data: plano } = await supabase.from("route_plans").select("*").eq("id", planId).maybeSingle()
  if (!plano) return null
  const { data: stops } = await supabase
    .from("route_stops")
    .select("*")
    .eq("route_plan_id", planId)
    .order("sort_order", { ascending: true })

  const empresaIds = (stops ?? []).filter((s) => s.entity_type === "company").map((s) => s.entity_id)
  const escolaIds = (stops ?? []).filter((s) => s.entity_type === "school").map((s) => s.entity_id)
  const [rc, rs] = await Promise.all([
    empresaIds.length
      ? supabase.from("companies").select("id, razao_social, nome_fantasia, cidade, latitude, longitude").in("id", empresaIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    escolaIds.length
      ? supabase.from("schools").select("id, name, cidade, latitude, longitude").in("id", escolaIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])
  const mapaEmp = new Map((rc.data ?? []).map((r: Record<string, unknown>) => [r.id as string, r]))
  const mapaEsc = new Map((rs.data ?? []).map((r: Record<string, unknown>) => [r.id as string, r]))

  const paradas: ParadaCarregada[] = (stops ?? []).map((s) => {
    const ent = s.entity_type === "company" ? mapaEmp.get(s.entity_id) : mapaEsc.get(s.entity_id)
    const nome = s.entity_type === "company"
      ? ((ent?.nome_fantasia as string) || (ent?.razao_social as string) || "Empresa")
      : ((ent?.name as string) || "Escola")
    return {
      id: s.id,
      entity_type: s.entity_type,
      entity_id: s.entity_id,
      sort_order: s.sort_order,
      fixed_time: s.fixed_time,
      estimated_arrival: s.estimated_arrival,
      visit_minutes: s.visit_minutes,
      notes: s.notes,
      nome,
      cidade: (ent?.cidade as string) ?? null,
      lat: (ent?.latitude as number) ?? null,
      lng: (ent?.longitude as number) ?? null,
    }
  })
  return { ...(plano as Omit<PlanoCarregado, "paradas">), paradas }
}

/** Lista planos visíveis ao ator (os próprios; gerência vê todos), mais recentes primeiro. */
export async function listarPlanos(limite = 30): Promise<PlanoCarregado[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("route_plans")
    .select("*")
    .order("plan_date", { ascending: false })
    .limit(limite)
  return (data ?? []).map((p) => ({ ...(p as Omit<PlanoCarregado, "paradas">), paradas: [] }))
}

/**
 * Sugestão de proximidade (Fase 5.4). Combina: distância geodésica às âncoras
 * já escolhidas (raio configurável), pertencimento à carteira, etapa do
 * pipeline e ausência de ação recente. Máx. 5, cada uma COM motivo.
 */
export async function sugerirProximidade(params: {
  ancoras: Coord[]
  excluirIds: string[]
  raioKm?: number
  actor?: ActorProfile | null
}): Promise<SugestaoProximidade[]> {
  const actor = params.actor ?? (await getActor())
  if (!actor || params.ancoras.length === 0) return []
  const raio = params.raioKm ?? 5
  const supabase = await createClient()
  const gestor = isManagerRole(actor.role)
  const hoje = new Date().toISOString().slice(0, 10)
  const excluir = new Set(params.excluirIds)

   
  let qc: any = supabase
    .from("companies")
    .select("id, razao_social, nome_fantasia, cidade, latitude, longitude, etapa, classificacao, proxima_acao, data_proxima_acao, ultimo_contato, possui_beneficio, owner_id")
    .not("latitude", "is", null)
    .limit(400)
  if (!gestor) qc = qc.eq("owner_id", actor.id)

   
  let qs: any = supabase
    .from("schools")
    .select("id, name, cidade, latitude, longitude, relationship_stage, classification, next_action, next_action_at, last_action_at, primary_owner_id")
    .not("latitude", "is", null)
    .limit(400)
  if (!gestor) qs = qs.eq("primary_owner_id", actor.id)

  const [rc, rs] = await Promise.all([qc, qs])

  const dias = (d?: string | null) => (d ? Math.floor((Date.parse(hoje) - Date.parse(d)) / 86400000) : null)
  const distMin = (lat: number, lng: number) =>
    Math.min(...params.ancoras.map((a) => distanciaGeodesicaKm(a, { lat, lng })))

  const cand: (SugestaoProximidade & { peso: number })[] = []

  for (const r of (rc.data ?? []) as Record<string, unknown>[]) {
    if (excluir.has(r.id as string)) continue
    const d = distMin(r.latitude as number, r.longitude as number)
    if (d > raio) continue
    const motivos: string[] = []
    let peso = 0
    const atraso = dias(r.data_proxima_acao as string)
    if (atraso !== null && atraso > 0) {
      peso += 200 + atraso
      motivos.push(`follow-up atrasado há ${atraso} ${atraso > 1 ? "dias" : "dia"}`)
    } else if (atraso === 0) {
      peso += 160
      motivos.push("follow-up marcado para hoje")
    }
    const semContato = dias(r.ultimo_contato as string)
    if (semContato === null) {
      peso += 60
      motivos.push("nunca contatada")
    } else if (semContato > 30) {
      peso += 70
      motivos.push(`${semContato} dias sem contato`)
    }
    if ((r.classificacao as string) === "Ouro" || (r.classificacao as string) === "A") {
      peso += 40
      motivos.push(`classificação ${r.classificacao}`)
    }
    if (motivos.length === 0) motivos.push(`no pipeline (${(r.etapa as string) || "sem etapa"})`)
    cand.push({
      id: r.id as string,
      tipo: "company",
      nome: (r.nome_fantasia as string) || (r.razao_social as string) || "Empresa",
      cidade: (r.cidade as string) ?? null,
      lat: r.latitude as number,
      lng: r.longitude as number,
      distanciaKm: d,
      motivo: `${d.toFixed(1)} km — ${motivos.slice(0, 2).join("; ")}`,
      peso,
    })
  }

  for (const r of (rs.data ?? []) as Record<string, unknown>[]) {
    if (excluir.has(r.id as string)) continue
    const d = distMin(r.latitude as number, r.longitude as number)
    if (d > raio) continue
    const motivos: string[] = []
    let peso = 0
    const atraso = dias(r.next_action_at as string)
    if (atraso !== null && atraso > 0) {
      peso += 190 + atraso
      motivos.push(`ação escolar atrasada há ${atraso} ${atraso > 1 ? "dias" : "dia"}`)
    }
    const semAcao = dias(r.last_action_at as string)
    if (semAcao === null) {
      peso += 55
      motivos.push("sem ação registrada")
    } else if (semAcao > 45) {
      peso += 65
      motivos.push(`${semAcao} dias sem ação`)
    }
    if ((r.classification as string) === "estrategica") {
      peso += 45
      motivos.push("escola estratégica")
    }
    if (motivos.length === 0) motivos.push(`relacionamento: ${(r.relationship_stage as string) || "mapeamento"}`)
    cand.push({
      id: r.id as string,
      tipo: "school",
      nome: (r.name as string) || "Escola",
      cidade: (r.cidade as string) ?? null,
      lat: r.latitude as number,
      lng: r.longitude as number,
      distanciaKm: d,
      motivo: `${d.toFixed(1)} km — ${motivos.slice(0, 2).join("; ")}`,
      peso,
    })
  }

  return cand
    .sort((a, b) => b.peso - a.peso || a.distanciaKm - b.distanciaKm)
    .slice(0, 5)
    .map(({ peso, ...s }) => {
      void peso
      return s
    })
}
