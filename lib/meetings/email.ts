import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"

export async function emailInvitationStatus() {
  const { data, error } = await createAdminClient().functions.invoke("send-calendar-invites", {
    body: { action: "status" },
  })
  return {
    configured: !error && data?.configured === true && typeof data?.organizerEmail === "string",
    organizerEmail: !error && typeof data?.organizerEmail === "string" ? data.organizerEmail : null,
  }
}

export async function syncEmailMeeting(id: string) {
  const admin = createAdminClient()
  const status = await emailInvitationStatus()
  if (!status.configured) return {
    synced: false,
    message: "Agendamento salvo. O envio aguarda a configuração do remetente de e-mail pela gerência; não é preciso vincular sua conta Microsoft.",
  }
  const { error: queueError } = await admin.rpc("b2b_queue_email_meeting", {
    p_id: id, p_sender: status.organizerEmail,
  })
  if (queueError) throw new Error("Não foi possível preparar os convites. Atualize a ficha e tente novamente.")
  for (let batch = 0; batch < 3; batch++) {
    const { data, error } = await admin.functions.invoke("send-calendar-invites", {
      body: { action: "process", meetingId: id, limit: 40 },
    })
    if (error || data?.failed || !data?.configured || Number(data?.selected || 0) < 40) break
  }
  const { error: settleError } = await admin.rpc("b2b_settle_email_meeting", { p_id: id })
  if (settleError) throw new Error("O envio foi iniciado. Atualize a ficha para conferir o resultado.")
  const { data, error } = await admin.from("activities")
    .select("sync_status,status").eq("id", id).single()
  if (error) throw new Error("Atualize a ficha para conferir o envio.")
  const synced = data.sync_status === "synced"
  return {
    synced,
    message: synced
      ? data.status === "cancelada"
        ? "Cancelamento enviado pelo serviço de e-mail. O histórico foi mantido."
        : "Convites enviados pelo serviço de e-mail. Cada participante, inclusive o consultor, pode aceitar na própria agenda."
      : "Agendamento salvo, com convites ainda pendentes. Use Tentar enviar novamente para verificar o envio.",
  }
}
