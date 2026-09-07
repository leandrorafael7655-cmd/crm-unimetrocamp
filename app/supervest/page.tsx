import { getActor } from "@/lib/auth/guards"
import { can } from "@/lib/domain/roles"
import {
  listSupervestCycles,
  getSupervestCycle,
  listSupervestSnapshots,
  apuracaoSupervest,
} from "@/lib/data/goals-queries"
import {
  SupervestClient,
  type CicloView,
  type ApuracaoView,
} from "@/components/goals/supervest-client"
import type { PontoCurva } from "@/components/goals/curva-evolucao"

export const dynamic = "force-dynamic"

export default async function SupervestPage({
  searchParams,
}: {
  searchParams: Promise<{ ciclo?: string }>
}) {
  const { ciclo } = await searchParams
  const actor = await getActor()
  const podeEscrever = actor ? can(actor.role, "supervest.write") : false

  const ciclosRaw = await listSupervestCycles()
  const ciclos: CicloView[] = ciclosRaw.map((c) => ({
    id: c.id,
    name: c.name,
    edition: c.edition,
    status: c.status,
    registrationsTarget: c.registrationsTarget,
    eventAt: c.eventAt,
  }))

  // Ciclo ativo: o solicitado, ou o primeiro (mais recente) da lista.
  const ativoId = ciclo && ciclos.some((c) => c.id === ciclo) ? ciclo : ciclos[0]?.id ?? null

  let cicloAtivo: CicloView | null = null
  let apuracao: ApuracaoView | null = null
  let curva: PontoCurva[] = []
  let metaRegistros = 0

  if (ativoId) {
    const [detalhe, snaps, ap] = await Promise.all([
      getSupervestCycle(ativoId),
      listSupervestSnapshots(ativoId),
      apuracaoSupervest(ativoId),
    ])
    if (detalhe) {
      cicloAtivo = {
        id: detalhe.id,
        name: detalhe.name,
        edition: detalhe.edition,
        status: detalhe.status,
        registrationsTarget: detalhe.registrationsTarget,
        eventAt: detalhe.eventAt,
      }
      metaRegistros = detalhe.registrationsTarget
    }
    apuracao = {
      oficial: ap.oficial,
      hsAtribuidas: ap.hsAtribuidas,
      b2bAtribuidas: ap.b2bAtribuidas,
      outrosCanais: ap.outrosCanais,
      inconsistente: ap.inconsistente,
    }
    // curva em ordem cronológica crescente
    curva = [...snaps]
      .sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate))
      .map((s) => ({ data: s.snapshotDate, valor: s.officialRegistrations }))
  }

  return (
    <SupervestClient
      ciclos={ciclos}
      cicloAtivo={cicloAtivo}
      apuracao={apuracao}
      curva={curva}
      metaRegistros={metaRegistros}
      podeEscrever={podeEscrever}
    />
  )
}
