import { requireCan } from "@/lib/auth/guards"
import { addDays, mondayOf } from "@/lib/domain/attendance"
import { saoPauloToday } from "@/lib/domain/school-agenda"
import { loadAttendanceRange } from "@/app/actions/attendance-ui"
import { AttendanceBoard } from "@/components/attendance/attendance-board"

export const dynamic = "force-dynamic"

export default async function MinhaAgendaPage() {
  const actor = await requireCan("attendance.read")
  const today = saoPauloToday()
  const start = mondayOf(today)
  const end = addDays(start, 55)
  const initial = await loadAttendanceRange({ start, end, userId: actor.id })

  return <AttendanceBoard initial={{ ...initial, anchor: today }} personalOnly />
}
