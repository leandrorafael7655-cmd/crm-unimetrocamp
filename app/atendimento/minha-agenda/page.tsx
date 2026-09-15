import { requireCan } from "@/lib/auth/guards"
import { ATTENDANCE_START_DATE, addDays, mondayOf } from "@/lib/domain/attendance"
import { loadAttendanceRange } from "@/app/actions/attendance-ui"
import { AttendanceBoard } from "@/components/attendance/attendance-board"

export const dynamic = "force-dynamic"

export default async function MinhaAgendaPage() {
  const actor = await requireCan("attendance.read")
  const today = new Date().toISOString().slice(0, 10)
  const anchor = today < ATTENDANCE_START_DATE ? ATTENDANCE_START_DATE : today
  const start = mondayOf(anchor)
  const end = addDays(start, 55)
  const initial = await loadAttendanceRange({ start, end, userId: actor.id })

  return <AttendanceBoard initial={initial} personalOnly />
}
