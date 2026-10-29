import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { calendarEmailStatus } from "@/lib/calendar/smtp-config"
import { processSmtpQueue } from "@/lib/calendar/smtp-worker"

export async function emailInvitationStatus() {
  return calendarEmailStatus()
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
  await processSmtpQueue({ meetingId: id })
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
        : "Convite aceito pelo servidor de e-mail para o responsável do CRM. Confira o recebimento na agenda."
      : "Agendamento salvo, com convites ainda pendentes. Use Tentar enviar novamente para verificar o envio.",
  }
}
