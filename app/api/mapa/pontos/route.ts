import { NextResponse } from "next/server"
import { requireCan } from "@/lib/auth/guards"
import { buscarPontosMapa, type FiltrosMapa, type CamadaMapa, type BBox } from "@/lib/data/map-queries"

export const dynamic = "force-dynamic"

function num(v: string | null): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function bool(v: string | null): boolean | null {
  if (v === "1" || v === "true") return true
  return null
}

/**
 * GET /api/mapa/pontos?camada=todos&oeste=&sul=&leste=&norte=&cidade=...
 * Consulta server-side, filtrada e limitada ao viewport. Exige map.read.
 */
export async function GET(request: Request) {
  try {
    await requireCan("map.read")
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)

  const oeste = num(searchParams.get("oeste"))
  const sul = num(searchParams.get("sul"))
  const leste = num(searchParams.get("leste"))
  const norte = num(searchParams.get("norte"))
  if (oeste == null || sul == null || leste == null || norte == null) {
    return NextResponse.json({ error: "Bounding box inválido." }, { status: 400 })
  }
  const bbox: BBox = { oeste, sul, leste, norte }

  const camadaRaw = searchParams.get("camada") as CamadaMapa | null
  const camada: CamadaMapa =
    camadaRaw === "empresas" || camadaRaw === "escolas" || camadaRaw === "todos" ? camadaRaw : "todos"

  const convenioRaw = searchParams.get("convenio")
  const filtros: FiltrosMapa = {
    camada,
    cidade: searchParams.get("cidade"),
    bairro: searchParams.get("bairro"),
    responsavel: searchParams.get("responsavel"),
    convenio: convenioRaw === "sim" || convenioRaw === "nao" ? convenioRaw : null,
    etapa: searchParams.get("etapa"),
    relacionamentoAtivo: bool(searchParams.get("relacionamentoAtivo")),
    escolaEstrategica: bool(searchParams.get("escolaEstrategica")),
    comAcaoAgendada: bool(searchParams.get("comAcaoAgendada")),
    comFollowupPendente: bool(searchParams.get("comFollowupPendente")),
  }

  const resultado = await buscarPontosMapa(filtros, bbox)
  return NextResponse.json(resultado)
}
