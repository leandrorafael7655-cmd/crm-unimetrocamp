export type AttendanceActivity = "room" | "conversion" | "external"
export type AttendanceStatus = "draft" | "published" | "cancelled"
export type AttendanceLane =
  | "room_early"
  | "room_late"
  | "conversion_am_external_pm"
  | "external_am_conversion_pm"
  | "saturday"

export const ATTENDANCE_START_DATE = "2026-10-26"
export const ATTENDANCE_TIMEZONE = "America/Sao_Paulo"

export const ACTIVITY_LABEL: Record<AttendanceActivity, string> = {
  room: "Sala de matrícula",
  conversion: "Conversão",
  external: "Atividade externa",
}

export const ACTIVITY_STYLE: Record<AttendanceActivity, string> = {
  room: "border-violet-200 bg-violet-50 text-violet-800",
  conversion: "border-amber-200 bg-amber-50 text-amber-800",
  external: "border-sky-200 bg-sky-50 text-sky-800",
}

export const LANE_LABEL: Record<AttendanceLane, string> = {
  room_early: "Sala · 9h–18h",
  room_late: "Sala · 11h–20h",
  conversion_am_external_pm: "Manhã conversão · tarde externa",
  external_am_conversion_pm: "Manhã externa · tarde conversão",
  saturday: "Sábado · 9h–12h",
}

export interface AttendanceSettings {
  timezone: string
  scheduleStartDate: string
  weekdayRoomOpen: string
  weekdayRoomClose: string
  roomEarlyStart: string
  roomEarlyEnd: string
  roomLateStart: string
  roomLateEnd: string
  morningStart: string
  morningEnd: string
  afternoonStart: string
  afternoonEnd: string
  saturdayStart: string
  saturdayEnd: string
  minRoomCoverage: number
  roomLocation: string
  conversionLocation: string
  externalLocation: string
  roomEarlyBreaks: Array<{ position: number; start: string; end: string }>
  roomLateBreaks: Array<{ position: number; start: string; end: string }>
}

export interface AttendanceSlot {
  slotKey: string
  label: string
  sortOrder: number
  userId: string | null
  enabled: boolean
}

export interface RotationEntry {
  weekIndex: number
  lane: AttendanceLane
  position: 1 | 2
  slotKey: string
}

export interface GeneratedOccurrence {
  id?: string
  cycleId?: string | null
  seriesKey: string
  templateWeekIndex: number
  slotKey: string
  userId: string | null
  responsibleName: string
  responsibleEmail?: string | null
  activity: AttendanceActivity
  date: string
  startTime: string
  endTime: string
  breakStart?: string | null
  breakEnd?: string | null
  location: string
  notes?: string | null
  status: AttendanceStatus
  eventUid?: string
  sequence?: number
}

export interface AttendanceIssue {
  severity: "error" | "warning"
  code: string
  message: string
  occurrenceIds?: string[]
  date?: string
}

export const padTime = (value: string | null | undefined) => (value || "").slice(0, 5)

export function dateFromIso(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number) {
  const date = dateFromIso(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return isoDate(date)
}

export function daysBetween(from: string, to: string) {
  return Math.floor((dateFromIso(to).getTime() - dateFromIso(from).getTime()) / 86_400_000)
}

export function weekIndexFor(cycleStart: string, date: string) {
  const weeks = Math.floor(daysBetween(cycleStart, date) / 7)
  return ((weeks % 4) + 4) % 4 + 1
}

export function weekdayOf(date: string) {
  return dateFromIso(date).getUTCDay() // 0 domingo, 6 sábado
}

export function isMonday(date: string) {
  return weekdayOf(date) === 1
}

export function mondayOf(date: string) {
  const day = weekdayOf(date)
  const delta = day === 0 ? -6 : 1 - day
  return addDays(date, delta)
}

export function sundayOf(date: string) {
  return addDays(mondayOf(date), 6)
}

export function monthRange(date: string) {
  const d = dateFromIso(date)
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
  return { start: isoDate(start), end: isoDate(end) }
}

export function formatDateBr(date: string) {
  const [y, m, d] = date.split("-")
  return `${d}/${m}/${y}`
}

export function timeToMinutes(value: string) {
  const [h, m] = value.slice(0, 5).split(":").map(Number)
  return h * 60 + m
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(bStart) < timeToMinutes(aEnd)
}
