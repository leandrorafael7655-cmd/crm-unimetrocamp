import "server-only"
import { createClient } from "@/lib/supabase/server"
import { summarizeMeetingDeliveries, type ContactDelivery, type MeetingDeliverySummary } from "./contact-domain"

export async function readContactMeetingStates(client: Awaited<ReturnType<typeof createClient>>, ids: string[]) {
  const result = new Map<string, { url: string | null; delivery: MeetingDeliverySummary | null }>()
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await client.from("contact_meetings")
      .select("id,meeting_url,contact_meeting_jobs(status,operation,event_sequence)").in("id", ids.slice(offset, offset + 100))
    if (error) throw new Error("Não foi possível conferir o envio das reuniões escolares.")
    for (const row of data || []) result.set(row.id, { url: row.meeting_url,
      delivery: summarizeMeetingDeliveries(row.contact_meeting_jobs as ContactDelivery[]) })
  }
  return result
}
