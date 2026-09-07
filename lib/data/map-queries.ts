import "server-only"
import { createClient } from "@/lib/supabase/server"

/** Camada de mapa. */
export type CamadaMapa = "empresas" | "escolas" | "todos"

/** Estado visual do marcador — modula a cor dentro da paleta da marca. */
export type EstadoPonto = "critico" | "atencao" | "ok"

export interface BBox {
  oeste: number // min lng
  sul: number // min lat
  leste: number // max lng
  norte: number // max lat
}

export interface FiltrosMapa {
  camada: CamadaMapa
  cidade?: string | null
  bairro?: string | null
  responsavel?: string | null // owner id
  convenio?: "sim" | "nao" | null // só empresas
  etapa?: string | null // só empresas
  relacionamentoAtivo?: boolean | null // só escolas
  escolaEstrategica?: boolean | null // só escolas
  comAcaoAgendada?: boolean | null
  comFollowupPendente?: boolean | null
}

export interface PontoMapa {
  id: string
  tipo: "empresa" | "escola"
  nome: string
  latitude: number
  longitude: number
  cidade: string | null
  bairro: string | null
  responsavelId: string | null
  responsavelNome: string | null
  estado: EstadoPonto
  // campos do card
  classificacao: string | null
  etapaOuRelacionamento: string | null
  convenio: boolean | null // empresa
  potencial: string | null // escola
  proximaAcao: string | null
  dataProximaAcao: string | null
}

export interface ResultadoMapa {
  pontos: PontoMapa[]
  truncado: boolean
  teto: number
  semCoordenada: { empresas: number; escolas: number }
}

const TETO_PADRAO = 500
const HOJE = () => new Date().toISOString().slice(0, 10)

/** Deriva o estado visual a partir de follow-up/ação pendente. */
function derivarEstado(proxima: string | null, dataProx: string | null): EstadoPonto {
  if (!proxima && !dataProx) return "ok"
  if (dataProx) {
    const hoje = HOJE()
    if (dataProx < hoje) return "critico" // follow-up atrasado
    if (dataProx === hoje) return "atencao" // vence hoje
  }
  return "ok"
}

/**
 * Busca pontos do mapa filtrados NO SERVIDOR e limitados ao bounding box.
 * Nunca traz a base inteira: aplica bbox + teto. Só entidades COM coordenada
 * aparecem; as sem coordenada são contadas à parte.
 */
export async function buscarPontosMapa(
  filtros: FiltrosMapa,
  bbox: BBox,
  teto: number = TETO_PADRAO,
): Promise<ResultadoMapa> {
  const supabase = await createClient()
  const pontos: PontoMapa[] = []
  const wantEmpresas = filtros.camada === "empresas" || filtros.camada === "todos"
  const wantEscolas = filtros.camada === "escolas" || filtros.camada === "todos"

  // ── perfis (para nome do responsável) ──
  const { data: perfis } = await supabase.from("profiles").select("id, full_name")
  const nomePorId = new Map((perfis ?? []).map((p) => [p.id, p.full_name as string]))

  // ── EMPRESAS ──
  if (wantEmpresas) {
     
    let q: any = supabase
      .from("companies")
      .select(
        "id, razao_social, nome_fantasia, cidade, bairro, latitude, longitude, owner_id, classificacao, etapa, possui_beneficio, proxima_acao, data_proxima_acao",
      )
      .not("latitude", "is", null)
      .gte("latitude", bbox.sul)
      .lte("latitude", bbox.norte)
      .gte("longitude", bbox.oeste)
      .lte("longitude", bbox.leste)
      .limit(teto + 1)

    if (filtros.cidade) q = q.eq("cidade", filtros.cidade)
    if (filtros.bairro) q = q.eq("bairro", filtros.bairro)
    if (filtros.responsavel) q = q.eq("owner_id", filtros.responsavel)
    if (filtros.etapa) q = q.eq("etapa", filtros.etapa)
    if (filtros.convenio === "sim") q = q.eq("possui_beneficio", "Sim")
    if (filtros.convenio === "nao") q = q.neq("possui_beneficio", "Sim")
    if (filtros.comAcaoAgendada) q = q.not("data_proxima_acao", "is", null)
    if (filtros.comFollowupPendente) q = q.lt("data_proxima_acao", HOJE())

    const { data } = await q
    for (const c of data ?? []) {
      pontos.push({
        id: c.id,
        tipo: "empresa",
        nome: (c.nome_fantasia || c.razao_social) as string,
        latitude: c.latitude as number,
        longitude: c.longitude as number,
        cidade: c.cidade,
        bairro: c.bairro,
        responsavelId: c.owner_id,
        responsavelNome: c.owner_id ? nomePorId.get(c.owner_id) ?? null : null,
        estado: derivarEstado(c.proxima_acao, c.data_proxima_acao),
        classificacao: c.classificacao,
        etapaOuRelacionamento: c.etapa,
        convenio: c.possui_beneficio === "Sim",
        potencial: null,
        proximaAcao: c.proxima_acao,
        dataProximaAcao: c.data_proxima_acao,
      })
    }
  }

  // ── ESCOLAS ──
  if (wantEscolas) {
     
    let q: any = supabase
      .from("schools")
      .select(
        "id, name, cidade, bairro, latitude, longitude, primary_owner_id, classification, relationship_stage, relationship_status, potential, next_action, next_action_at",
      )
      .not("latitude", "is", null)
      .gte("latitude", bbox.sul)
      .lte("latitude", bbox.norte)
      .gte("longitude", bbox.oeste)
      .lte("longitude", bbox.leste)
      .limit(teto + 1)

    if (filtros.cidade) q = q.eq("cidade", filtros.cidade)
    if (filtros.bairro) q = q.eq("bairro", filtros.bairro)
    if (filtros.responsavel) q = q.eq("primary_owner_id", filtros.responsavel)
    if (filtros.relacionamentoAtivo) q = q.eq("relationship_status", "ativo")
    if (filtros.escolaEstrategica) q = q.eq("classification", "estrategica")
    if (filtros.comAcaoAgendada) q = q.not("next_action_at", "is", null)
    if (filtros.comFollowupPendente) q = q.lt("next_action_at", HOJE())

    const { data } = await q
    for (const s of data ?? []) {
      pontos.push({
        id: s.id,
        tipo: "escola",
        nome: s.name as string,
        latitude: s.latitude as number,
        longitude: s.longitude as number,
        cidade: s.cidade,
        bairro: s.bairro,
        responsavelId: s.primary_owner_id,
        responsavelNome: s.primary_owner_id ? nomePorId.get(s.primary_owner_id) ?? null : null,
        estado: derivarEstado(s.next_action, s.next_action_at),
        classificacao: s.classification,
        etapaOuRelacionamento: s.relationship_stage,
        convenio: null,
        potencial: s.potential,
        proximaAcao: s.next_action,
        dataProximaAcao: s.next_action_at,
      })
    }
  }

  const truncado = pontos.length > teto
  const pontosFinal = truncado ? pontos.slice(0, teto) : pontos

  // contagem de entidades SEM coordenada (para o aviso "N sem endereço localizado")
  const semCoordenada = { empresas: 0, escolas: 0 }
  if (wantEmpresas) {
    const { count } = await supabase
      .from("companies")
      .select("id", { count: "exact", head: true })
      .is("latitude", null)
    semCoordenada.empresas = count ?? 0
  }
  if (wantEscolas) {
    const { count } = await supabase
      .from("schools")
      .select("id", { count: "exact", head: true })
      .is("latitude", null)
    semCoordenada.escolas = count ?? 0
  }

  return { pontos: pontosFinal, truncado, teto, semCoordenada }
}

/** Opções de filtro (cidades, bairros, responsáveis) para popular os selects. */
export async function opcoesFiltroMapa(): Promise<{
  cidades: string[]
  responsaveis: { id: string; nome: string }[]
  etapas: string[]
}> {
  const supabase = await createClient()
  const [empresas, escolas, perfis] = await Promise.all([
    supabase.from("companies").select("cidade, etapa"),
    supabase.from("schools").select("cidade"),
    supabase.from("profiles").select("id, full_name").eq("active", true),
  ])
  const cidades = new Set<string>()
  const etapas = new Set<string>()
  for (const c of empresas.data ?? []) {
    if (c.cidade) cidades.add(c.cidade)
    if (c.etapa) etapas.add(c.etapa)
  }
  for (const s of escolas.data ?? []) if (s.cidade) cidades.add(s.cidade)
  return {
    cidades: [...cidades].sort(),
    etapas: [...etapas].sort(),
    responsaveis: (perfis.data ?? []).map((p) => ({ id: p.id, nome: p.full_name as string })),
  }
}
