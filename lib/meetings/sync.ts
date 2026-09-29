import "server-only"
import { randomUUID } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { graphPayload, normalizeEmail } from "./domain"
import { graphRequest, GraphError } from "./microsoft"
import type { MeetingRow } from "./types"

export interface OutlookEvent {
  id: string
  changeKey: string
  webLink?: string
  "@odata.etag"?: string
  body?: { content: string }
  isOnlineMeeting?: boolean
  isCancelled?: boolean
  onlineMeeting?: { joinUrl: string }
  attendees?: { emailAddress: { address: string }; status?: { response: string } }[]
}
export async function syncMeeting(id: string) {
  const admin = createAdminClient(),
    lock = randomUUID()
  const stale = new Date(Date.now() - 5 * 60000).toISOString()
  const { data, error } = await admin
    .from("activities")
    .update({ sync_status: "syncing", sync_lock: lock, sync_locked_at: new Date().toISOString() })
    .eq("id", id)
    .not("meeting_type", "is", null)
    .or(`sync_status.in.(pending,failed),and(sync_status.eq.syncing,sync_locked_at.lt.${stale})`)
    .select("*")
    .maybeSingle()
  if (error) throw new Error("Não foi possível iniciar a sincronização.")
  if (!data)
    return {
      synced: false,
      message: "A reunião já foi sincronizada ou está sendo processada. Atualize a ficha.",
    }
  const meeting = data as MeetingRow
  try {
    const eventPath = meeting.outlook_event_id
      ? `/me/events/${encodeURIComponent(meeting.outlook_event_id)}`
      : null
    let event: OutlookEvent | undefined
    if (meeting.sync_operation === "cancel") {
      if (!eventPath)
        throw new Error("O evento ainda não foi criado. Conclua a sincronização antes de cancelar.")
      try {
        await graphRequest(meeting.organizer_user_id, `${eventPath}/cancel`, {
          method: "POST",
          body: JSON.stringify({ comment: "Reunião cancelada pelo organizador no UniConecta." }),
        })
      } catch (error) {
        // Retrying after a successful cancel may find the event already removed.
        if (!(error instanceof GraphError && error.status === 404)) throw error
      }
    } else {
      const payload = meeting.sync_payload
      if (!payload) throw new Error("Dados de sincronização ausentes. Procure a gerência.")
      if (eventPath) {
        const current = await graphRequest<OutlookEvent>(meeting.organizer_user_id, eventPath)
        if (current.isCancelled)
          throw new Error(
            "O evento foi cancelado no Outlook. Atualize as respostas para registrar o cancelamento.",
          )
        if (meeting.sync_operation === "create") {
          event = current // recovery after Graph success + database/network failure
        } else {
          event = await graphRequest<OutlookEvent>(meeting.organizer_user_id, eventPath, {
            method: "PATCH",
            headers: current["@odata.etag"] ? { "If-Match": current["@odata.etag"] } : {},
            body: JSON.stringify(graphPayload(payload, meeting.id, current)),
          })
        }
      } else {
        if (meeting.sync_operation !== "create")
          throw new Error("Identificador do Outlook ausente. Nenhum novo evento foi criado.")
        if (payload.meeting_type === "teams") {
          const calendar = await graphRequest<{ allowedOnlineMeetingProviders: string[] }>(
            meeting.organizer_user_id,
            "/me/calendar?$select=allowedOnlineMeetingProviders",
          )
          if (!calendar.allowedOnlineMeetingProviders?.includes("teamsForBusiness"))
            throw new Error(
              "Teams não está habilitado para o calendário desta conta. Confira sua licença com a TI.",
            )
        }
        event = await graphRequest<OutlookEvent>(meeting.organizer_user_id, "/me/events", {
          method: "POST",
          body: JSON.stringify(graphPayload(payload, meeting.id)),
        })
      }
      if (!event?.id) throw new Error("A Microsoft não retornou o identificador do evento.")
      const { error: persistError } = await admin
        .from("activities")
        .update({
          outlook_event_id: event.id,
          outlook_web_url: event.webLink,
          outlook_change_key: event.changeKey,
        })
        .eq("id", id)
        .eq("sync_lock", lock)
      if (persistError)
        throw new Error(
          "Outlook respondeu, mas o registro local falhou. Tente sincronizar o mesmo agendamento novamente.",
        )
      if (payload.meeting_type === "teams" && !event.onlineMeeting?.joinUrl) {
        event = await graphRequest<OutlookEvent>(
          meeting.organizer_user_id,
          `/me/events/${encodeURIComponent(event.id)}`,
        )
        if (!event.onlineMeeting?.joinUrl)
          throw new Error(
            "O evento existe no Outlook, mas o link Teams ainda não ficou disponível. Tente sincronizar novamente; o evento será preservado.",
          )
      }
    }
    const { error: finishError } = await admin.rpc("b2b_finish_meeting", {
      p_id: id,
      p_lock: lock,
      p_event: event || {},
    })
    if (finishError)
      throw new Error(
        "Outlook respondeu, mas o histórico ainda não foi atualizado. Tente sincronizar novamente.",
      )
    return {
      synced: true,
      message:
        meeting.sync_operation === "cancel"
          ? "Cancelamento processado pelo Outlook."
          : "Reunião sincronizada. O Outlook enviou os convites aos participantes.",
    }
  } catch (error) {
    const message =
      error instanceof Error && error.name !== "TimeoutError"
        ? error.message
        : "A Microsoft demorou a responder. Tente sincronizar novamente o mesmo agendamento."
    const { error: saveError } = await admin
      .from("activities")
      .update({ sync_status: "failed", sync_error: message, sync_lock: null, sync_locked_at: null })
      .eq("id", id)
      .eq("sync_lock", lock)
    if (saveError)
      throw new Error(
        "Falha de sincronização; aguarde alguns minutos e atualize a ficha antes de tentar novamente.",
      )
    return { synced: false, message }
  }
}
export async function refreshMeetingResponses(meeting: MeetingRow) {
  if (!meeting.outlook_event_id) throw new Error("Conclua o envio antes de consultar as respostas.")
  const event = await graphRequest<OutlookEvent>(
    meeting.organizer_user_id,
    `/me/events/${encodeURIComponent(meeting.outlook_event_id)}`,
  )
  const responses = (event.attendees || []).map((p) => ({
    email: normalizeEmail(p.emailAddress.address),
    response: p.status?.response || "none",
  }))
  const principal = responses.find((p) => p.email === normalizeEmail(meeting.contact_email))?.response
  let status = meeting.status
  if (event.isCancelled && !["realizada", "nao_compareceu"].includes(status)) status = "cancelada"
  else if (["agendada", "confirmada"].includes(status))
    status = principal === "accepted" ? "confirmada" : "agendada"
  const { error } = await createAdminClient()
    .from("activities")
    .update({
      meeting_rsvp: responses,
      status,
      outlook_change_key: event.changeKey,
      ...(event.onlineMeeting?.joinUrl ? { teams_meeting_url: event.onlineMeeting.joinUrl } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", meeting.id)
    .eq("revision", meeting.revision)
    .eq("sync_status", "synced")
  if (error) throw new Error("Não foi possível registrar as respostas.")
  return "Respostas atualizadas. Propostas de novo horário podem ser consultadas no Outlook."
}
