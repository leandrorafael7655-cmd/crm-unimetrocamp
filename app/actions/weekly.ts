"use server"

import { revalidatePath } from "next/cache"
import { requireManager } from "@/lib/auth/guards"
import { backfillSemanas } from "@/lib/data/weekly-close"

type BackfillResultado =
  | { ok: true; criados: number; avaliados: number; de: string | null; ate: string }
  | { ok: false; message: string }

/**
 * Backfill do histórico de fechamento semanal, restrito a gerência/supervisão.
 *
 * Existe porque o cron pode nunca ter rodado: congela TODAS as semanas passadas
 * desde a primeira meta B2B semanal, não só as 12 da auto-recuperação. Idempotente
 * — reexecutar não duplica linhas. Retorna quantos snapshots foram criados, número
 * que comprova a reconstrução do histórico.
 */
export async function backfillFechamentoSemanal(): Promise<BackfillResultado> {
  try {
    await requireManager()
    const r = await backfillSemanas()
    revalidatePath("/gestao/metas")
    revalidatePath("/dashboard")
    return { ok: true, criados: r.criados, avaliados: r.avaliados, de: r.de, ate: r.ate }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao executar o backfill."
    return { ok: false, message: msg }
  }
}
