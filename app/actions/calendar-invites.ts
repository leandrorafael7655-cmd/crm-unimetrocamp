"use server"
import { requireActor } from "@/lib/auth/guards"
import { can } from "@/lib/domain/roles"
import { processSmtpQueue } from "@/lib/calendar/smtp-worker"

export async function dispatchCalendarInvites() {
  const actor = await requireActor()
  return processSmtpQueue({ userId: can(actor.role, "attendance.manage") ? undefined : actor.id })
}
