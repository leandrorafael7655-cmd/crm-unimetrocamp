import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

export type CalendarSourceType = "attendance" | "school_action" | "company_activity"

export interface CalendarSyncInput {
  sourceType: CalendarSourceType
  sourceId: string
  recipientUserId?: string | null
  title: string
  startAt: string
  endAt: string
  timezone?: string
  location?: string | null
  description?: string | null
  crmPath?: string | null
  actorId?: string | null
  cancel?: boolean
}

const clean = (value?: string | null) => (value ?? "").trim() || null

function sameEvent(row: any, input: CalendarSyncInput) {
  return (
    row.title === input.title &&
    new Date(row.start_at).getTime() === new Date(input.startAt).getTime() &&
    new Date(row.end_at).getTime() === new Date(input.endAt).getTime() &&
    row.timezone === (input.timezone || "America/Sao_Paulo") &&
    (row.location ?? null) === clean(input.location) &&
    (row.description ?? null) === clean(input.description) &&
    (row.crm_path ?? null) === clean(input.crmPath) &&
    row.status === "active"
  )
}

async function queueJob(eventId: string, operation: "REQUEST" | "CANCEL", sequence: number) {
  const admin = createAdminClient()
  const idempotencyKey = `${eventId}:${operation}:${sequence}`
  const { error } = await admin.from("calendar_invite_jobs").upsert(
    {
      calendar_event_id: eventId,
      operation,
      event_sequence: sequence,
      idempotency_key: idempotencyKey,
      status: "pending",
      attempts: 0,
      last_error: null,
      next_attempt_at: null,
    },
    { onConflict: "idempotency_key", ignoreDuplicates: true },
  )
  if (error) throw new Error(`Falha ao enfileirar convite: ${error.message}`)
}

async function cancelEvent(row: any, actorId?: string | null) {
  if (row.status === "cancelled") return
  const admin = createAdminClient()
  const sequence = Number(row.sequence ?? 0) + 1
  const { error } = await admin
    .from("calendar_events")
    .update({ status: "cancelled", sequence, updated_by: actorId ?? null })
    .eq("id", row.id)
  if (error) throw new Error(`Falha ao cancelar evento de calendário: ${error.message}`)
  await queueJob(row.id, "CANCEL", sequence)
}

/**
 * Mantém um evento por fonte + destinatário e uma fila idempotente de REQUEST/CANCEL.
 * Ao trocar o responsável, o evento anterior é cancelado e um novo é criado para
 * o novo destinatário, preservando histórico e UID por destinatário.
 */
export async function syncCalendarEvent(input: CalendarSyncInput) {
  const admin = createAdminClient()
  const { data: existing, error: readError } = await admin
    .from("calendar_events")
    .select("*")
    .eq("source_type", input.sourceType)
    .eq("source_id", input.sourceId)
  if (readError) throw new Error(`Falha ao ler eventos vinculados: ${readError.message}`)

  const rows = existing ?? []

  // Sem responsável ou fonte cancelada: cancela todos os destinatários ainda ativos.
  if (!input.recipientUserId || input.cancel) {
    for (const row of rows) await cancelEvent(row, input.actorId)
    return { changed: rows.some((r: any) => r.status !== "cancelled") }
  }

  // Troca de responsável: cancela os destinatários anteriores.
  for (const row of rows) {
    if (row.recipient_user_id !== input.recipientUserId) await cancelEvent(row, input.actorId)
  }

  const current = rows.find((row: any) => row.recipient_user_id === input.recipientUserId)
  if (current && sameEvent(current, input)) return { changed: false, eventId: current.id }

  if (current) {
    const sequence = Number(current.sequence ?? 0) + 1
    const { error } = await admin
      .from("calendar_events")
      .update({
        title: input.title,
        start_at: input.startAt,
        end_at: input.endAt,
        timezone: input.timezone || "America/Sao_Paulo",
        location: clean(input.location),
        description: clean(input.description),
        crm_path: clean(input.crmPath),
        status: "active",
        sequence,
        updated_by: input.actorId ?? null,
      })
      .eq("id", current.id)
    if (error) throw new Error(`Falha ao atualizar evento: ${error.message}`)
    await queueJob(current.id, "REQUEST", sequence)
    return { changed: true, eventId: current.id }
  }

  const { data: created, error } = await admin
    .from("calendar_events")
    .insert({
      source_type: input.sourceType,
      source_id: input.sourceId,
      recipient_user_id: input.recipientUserId,
      title: input.title,
      start_at: input.startAt,
      end_at: input.endAt,
      timezone: input.timezone || "America/Sao_Paulo",
      location: clean(input.location),
      description: clean(input.description),
      crm_path: clean(input.crmPath),
      created_by: input.actorId ?? null,
      updated_by: input.actorId ?? null,
    })
    .select("id,sequence")
    .single()
  if (error || !created) throw new Error(`Falha ao criar evento: ${error?.message ?? "erro desconhecido"}`)
  await queueJob(created.id, "REQUEST", Number(created.sequence ?? 0))
  return { changed: true, eventId: created.id }
}

/** Converte data/hora local de São Paulo em ISO com offset explícito. */
export function saoPauloIso(date: string, time: string) {
  return `${date}T${time.length === 5 ? `${time}:00` : time}-03:00`
}
