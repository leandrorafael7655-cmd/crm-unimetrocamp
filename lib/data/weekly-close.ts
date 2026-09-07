import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  inicioSemanaComercial,
  fimSemanaComercial,
  semanasNoIntervalo,
  semanaAtingida,
} from "@/lib/domain/goals"

interface MetaB2b {
  scopeType: string
  userId: string | null
  targetValue: number
  startAt: string
  endAt: string
  status: string
}

function resolverAlvo(weekStart: string, metas: MetaB2b[], userId: string): number {
  const cobre = (g: MetaB2b) => g.status === "ativa" && g.startAt <= weekStart && g.endAt >= weekStart
  const ind = metas.find((g) => g.scopeType === "individual" && g.userId === userId && cobre(g))
  if (ind) return ind.targetValue
  const geral = metas.find((g) => g.scopeType === "geral" && cobre(g))
  return geral ? geral.targetValue : 0
}

/**
 * Fecha (congela) as semanas comerciais JÁ ENCERRADAS num intervalo, gravando
 * snapshots idempotentes com applied_target congelado. NUNCA fecha a semana
 * corrente. Usa service_role (ignora RLS) — só deve ser chamado por rota de cron
 * autorizada. Retorna quantos snapshots foram efetivamente criados.
 *
 * @param semanasParaTras quantas semanas retroativas considerar (backfill).
 */
export async function fecharSemanas(semanasParaTras = 12): Promise<{ criados: number; avaliados: number }> {
  const hoje = new Date()
  const inicioJanela = new Date(hoje)
  inicioJanela.setDate(inicioJanela.getDate() - 7 * semanasParaTras)
  return fecharSemanasDesde(inicioSemanaComercial(inicioJanela))
}

/**
 * Núcleo do fechamento: congela todas as semanas comerciais JÁ ENCERRADAS a
 * partir de `deISO` (inclusive) até a corrente (exclusive). Idempotente via
 * índice único (user_id, week_start) + ON CONFLICT DO NOTHING.
 *
 * Registra `console.error("[fechamento-semanal] …")` para cada upsert que
 * falhar, incluindo user_id, week_start e a mensagem — o mecanismo engole o
 * erro para não travar quem o chama, mas deixa rastro pesquisável nos logs.
 */
export async function fecharSemanasDesde(deISO: string): Promise<{ criados: number; avaliados: number }> {
  const admin = createAdminClient()

  const hoje = new Date()
  const semanaCorrente = inicioSemanaComercial(hoje)
  const de = deISO
  // só semanas estritamente anteriores à corrente entram no fechamento
  const todas = semanasNoIntervalo(de, semanaCorrente).filter((ws) => ws < semanaCorrente)

  // consultores ativos que contam para meta semanal B2B
  const { data: perfis } = await admin
    .from("profiles")
    .select("id, role")
    .eq("active", true)
    .in("role", ["consultor_b2b", "supervisor"])
  const consultores = perfis ?? []

  // metas B2B semanais vigentes na janela
  const { data: metasData } = await admin
    .from("goals")
    .select("scope_type, user_id, target_value, start_at, end_at, status")
    .eq("goal_type", "b2b_weekly_actions")
  const metas: MetaB2b[] = (metasData ?? []).map((g) => ({
    scopeType: g.scope_type,
    userId: g.user_id,
    targetValue: Number(g.target_value),
    startAt: g.start_at,
    endAt: g.end_at,
    status: g.status,
  }))

  let criados = 0
  let avaliados = 0

  for (const consultor of consultores) {
    // exceções do consultor (semana não aplicável)
    const { data: exc } = await admin
      .from("goal_week_exceptions")
      .select("week_start, reason")
      .eq("user_id", consultor.id)
    const excByWeek = new Map((exc ?? []).map((e) => [e.week_start, e]))

    for (const ws of todas) {
      const we = fimSemanaComercial(ws)
      const alvo = resolverAlvo(ws, metas, consultor.id)
      const excecao = excByWeek.get(ws)

      // contagem anti-dupla-contagem: ação realizada, conta_meta_semanal, empresa vinculada
      const { data: acts } = await admin
        .from("activities")
        .select("company_id")
        .eq("primary_owner_id", consultor.id)
        .eq("status", "realizada")
        .eq("conta_meta_semanal", true)
        .not("company_id", "is", null)
        .gte("data", ws)
        .lte("data", we)
      const completed = acts?.length ?? 0
      const distinct = new Set((acts ?? []).map((a) => a.company_id)).size

      avaliados++
      // ON CONFLICT DO NOTHING via upsert com ignoreDuplicates → idempotente
      const { error, count } = await admin
        .from("weekly_action_snapshots")
        .upsert(
          {
            user_id: consultor.id,
            week_start: ws,
            week_end: we,
            applied_target: alvo,
            completed_actions: completed,
            distinct_companies: distinct,
            achieved: semanaAtingida(completed, alvo),
            applicable: !excecao,
            exception_reason: excecao?.reason ?? null,
            closed_at: new Date().toISOString(),
          },
          { onConflict: "user_id,week_start", ignoreDuplicates: true, count: "exact" },
        )
      if (error) {
        // Falha silenciosa aqui produziria aderência sutilmente errada e sem
        // rastro. Logamos com prefixo estável e pesquisável nos logs da Vercel.
        console.error(
          `[fechamento-semanal] falha ao congelar snapshot user_id=${consultor.id} week_start=${ws}: ${error.message}`,
        )
      } else if (count && count > 0) {
        criados += count
      }
    }
  }

  return { criados, avaliados }
}

/**
 * Backfill manual restrito a gerência (ver app/actions/weekly.ts).
 *
 * Diferente da auto-recuperação (janela fixa de 12 semanas), o backfill congela
 * TODO o histórico desde a primeira meta B2B semanal cadastrada — porque o cron
 * nunca rodou e o acúmulo pode ser maior que 12 semanas. Sem meta cadastrada,
 * não há denominador de aderência, então não há o que congelar.
 *
 * Retorna a janela efetiva e quantos snapshots foram criados — esse número é a
 * prova de que o histórico foi reconstruído.
 */
export async function backfillSemanas(): Promise<{
  criados: number
  avaliados: number
  de: string | null
  ate: string
}> {
  const admin = createAdminClient()
  const semanaCorrente = inicioSemanaComercial(new Date())

  // primeira meta B2B semanal já cadastrada define o início real do histórico.
  const { data: metaMaisAntiga } = await admin
    .from("goals")
    .select("start_at")
    .eq("goal_type", "b2b_weekly_actions")
    .order("start_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!metaMaisAntiga?.start_at) {
    return { criados: 0, avaliados: 0, de: null, ate: semanaCorrente }
  }

  const de = inicioSemanaComercial(new Date(`${metaMaisAntiga.start_at}T00:00:00.000Z`))
  const { criados, avaliados } = await fecharSemanasDesde(de)
  return { criados, avaliados, de, ate: semanaCorrente }
}

/**
 * Auto-recuperação de lacuna, chamada ao carregar o dashboard.
 *
 * A Vercel NÃO garante a invocação do cron (plano Hobby) e cada semana perdida
 * é irrecuperável — então tratamos a ausência do cron como ATRASO, não perda:
 * se a última semana comercial encerrada ainda não tem snapshot, fechamos na
 * hora, reaproveitando `fecharSemanas` (mesma regra idempotente, sem duplicar).
 *
 * É deliberadamente barata no caminho comum (dois `head:count`) e auto-gated:
 * só dispara o loop completo quando há consultores ativos E a semana está aberta
 * de fechamento. NUNCA lança — qualquer erro vira no-op para não travar o render.
 */
export async function garantirFechamentoEmDia(): Promise<{ executou: boolean; criados: number }> {
  try {
    const admin = createAdminClient()

    // última semana comercial ENCERRADA = corrente − 7 dias.
    const semanaCorrente = inicioSemanaComercial(new Date())
    const d = new Date(`${semanaCorrente}T00:00:00.000Z`)
    d.setUTCDate(d.getUTCDate() - 7)
    const ultimaEncerrada = d.toISOString().slice(0, 10)

    // sem consultores ativos não há aderência semanal a fechar.
    const { count: consultores } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .in("role", ["consultor_b2b", "supervisor"])
    if (!consultores) return { executou: false, criados: 0 }

    // já existe snapshot para a última semana encerrada? então está em dia.
    const { count: jaFechada } = await admin
      .from("weekly_action_snapshots")
      .select("user_id", { count: "exact", head: true })
      .eq("week_start", ultimaEncerrada)
    if (jaFechada && jaFechada > 0) return { executou: false, criados: 0 }

    // lacuna detectada → fecha reaproveitando a função idempotente do cron.
    const { criados } = await fecharSemanas(12)
    return { executou: true, criados }
  } catch (e) {
    // Engolimos para não travar o render do dashboard, mas deixamos rastro:
    // uma integridade de dados falhando em silêncio é o pior cenário.
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[fechamento-semanal] auto-recuperação falhou no dashboard: ${msg}`)
    return { executou: false, criados: 0 }
  }
}
