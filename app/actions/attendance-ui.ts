"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { requireCan } from "@/lib/auth/guards"
import { can } from "@/lib/domain/roles"
import {
  getAttendanceData,
  previewSuggestedSchedule,
  type AttendancePreviewInput,
} from "@/app/actions/attendance"

function serializeBase(raw: any) {
  if (!raw) return raw
  const { profileById: _profileById, ...safe } = raw
  return safe
}

export async function loadAttendanceRange(input?: {
  start?: string
  end?: string
  userId?: string
  activity?: string
  status?: string
}) {
  const actor = await requireCan("attendance.read")
  const data = serializeBase(await getAttendanceData(input))
  const admin = createAdminClient()
  const start = input?.start || data.start
  const end = input?.end || data.end
  const manager = can(actor.role, "attendance.manage")

  const [cyclesRes, exceptionsRes, absencesRes] = await Promise.all([
    manager
      ? admin.from("attendance_cycles").select("id,name,cycle_start,period_start,period_end,status,published_at").lte("period_start", end).gte("period_end", start).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null } as any),
    admin.from("attendance_exceptions").select("exception_date,kind,closed,note").gte("exception_date", start).lte("exception_date", end).order("exception_date"),
    manager
      ? admin.from("attendance_absences").select("id,user_id,absence_date,start_time,end_time,reason,active").gte("absence_date", start).lte("absence_date", end).eq("active", true).order("absence_date")
      : admin.from("attendance_absences").select("id,user_id,absence_date,start_time,end_time,reason,active").eq("user_id", actor.id).gte("absence_date", start).lte("absence_date", end).eq("active", true).order("absence_date"),
  ])

  return {
    ...data,
    cycles: cyclesRes.data ?? [],
    exceptions: exceptionsRes.data ?? [],
    absences: absencesRes.data ?? [],
  }
}

export async function previewAttendanceSchedule(input: AttendancePreviewInput) {
  const result: any = await previewSuggestedSchedule(input)
  if (!result?.ok || !result.preview) return result
  return { ...result, preview: serializeBase(result.preview) }
}
