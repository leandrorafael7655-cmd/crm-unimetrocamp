import { ATTENDANCE_START_DATE, addDays, mondayOf } from "@/lib/domain/attendance"
import { loadAttendanceRange } from "@/app/actions/attendance-ui"
import { AttendanceBoard } from "@/components/attendance/attendance-board"

export const dynamic = "force-dynamic"

export default async function AtendimentoPage() {
  const today = new Date().toISOString().slice(0, 10)
  const anchor = today < ATTENDANCE_START_DATE ? ATTENDANCE_START_DATE : today
  const start = mondayOf(anchor)
  const end = addDays(start, 41)
  const initial = await loadAttendanceRange({ start, end })

  return <AttendanceBoard initial={initial} />
}
