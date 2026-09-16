"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { requireCan, requireActor } from "@/lib/auth/guards"
import { can } from "@/lib/domain/roles"
import {
  ACTIVITY_LABEL,
  ATTENDANCE_START_DATE,
  type AttendanceActivity,
  type AttendanceIssue,
  type AttendanceLane,
  type AttendanceSettings,
  type AttendanceSlot,
  type GeneratedOccurrence,
  type RotationEntry,
  addDays,
  daysBetween,
  isMonday,
  overlaps,
  padTime,
  timeToMinutes,
  weekdayOf,
  weekIndexFor,
  mondayOf,
  sundayOf,
} from "@/lib/domain/attendance"
import { saoPauloIso, syncCalendarEvent } from "@/lib/calendar/calendar-sync"

export type AttendanceActionResult =
  | { ok: true; message: string; [key: string]: unknown }
  | { ok: false; message: string; issues?: AttendanceIssue[] }

export interface AttendancePreviewInput {
  cycleStart: string
  periodStart: string
  periodEnd: string
}

const validEmail = (email?: string | null) => Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
const stripTime = (v?: string | null) => (v || "").slice(0, 5)

function mapSettings(row: any): AttendanceSettings {
  return {
    timezone: row?.timezone || "America/Sao_Paulo",
    scheduleStartDate: row?.schedule_start_date || ATTENDANCE_START_DATE,
    weekdayRoomOpen: stripTime(row?.weekday_room_open || "09:00"),
    weekdayRoomClose: stripTime(row?.weekday_room_close || "20:00"),
    roomEarlyStart: stripTime(row?.room_early_start || "09:00"),
    roomEarlyEnd: stripTime(row?.room_early_end || "18:00"),
    roomLateStart: stripTime(row?.room_late_start || "11:00"),
    roomLateEnd: stripTime(row?.room_late_end || "20:00"),
    morningStart: stripTime(row?.morning_start || "09:00"),
    morningEnd: stripTime(row?.morning_end || "13:00"),
    afternoonStart: stripTime(row?.afternoon_start || "14:00"),
    afternoonEnd: stripTime(row?.afternoon_end || "18:00"),
    saturdayStart: stripTime(row?.saturday_start || "09:00"),
    saturdayEnd: stripTime(row?.saturday_end || "12:00"),
    minRoomCoverage: Number(row?.min_room_coverage || 2),
    roomLocation: row?.room_location || "Sala de Matrícula · UniMetrocamp Wyden",
    conversionLocation: row?.conversion_location || "UniMetrocamp Wyden · Conversão",
    externalLocation: row?.external_location || "Atividade externa",
    roomEarlyBreaks: Array.isArray(row?.room_early_breaks) ? row.room_early_breaks : [],
    roomLateBreaks: Array.isArray(row?.room_late_breaks) ? row.room_late_breaks : [],
  }
}

async function loadSchedulingBase() {
  const admin = createAdminClient()
  const [settingsRes, slotsRes, rotationRes, profilesRes, membersRes] = await Promise.all([
    admin.from("attendance_settings").select("*").eq("id", 1).single(),
    admin.from("attendance_team_slots").select("*").eq("active", true).order("sort_order"),
    admin.from("attendance_rotation_template").select("*").order("week_index").order("lane").order("position"),
    admin.from("profiles").select("id,full_name,email,role,active").eq("active", true).order("full_name"),
    admin.from("attendance_members").select("user_id,enabled"),
  ])
  if (settingsRes.error) throw new Error(settingsRes.error.message)
  if (slotsRes.error) throw new Error(slotsRes.error.message)
  if (rotationRes.error) throw new Error(rotationRes.error.message)
  if (profilesRes.error) throw new Error(profilesRes.error.message)
  if (membersRes.error) throw new Error(membersRes.error.message)

  const profiles = profilesRes.data ?? []
  const profileById = new Map(profiles.map((p: any) => [p.id, p]))
  const memberById = new Map((membersRes.data ?? []).map((m: any) => [m.user_id, Boolean(m.enabled)]))
  const slots: AttendanceSlot[] = (slotsRes.data ?? []).map((row: any) => ({
    slotKey: row.slot_key,
    label: row.label,
    sortOrder: Number(row.sort_order),
    userId: row.user_id || null,
    enabled: Boolean(row.active),
  }))
  const rotation: RotationEntry[] = (rotationRes.data ?? []).map((row: any) => ({
    weekIndex: Number(row.week_index),
    lane: row.lane as AttendanceLane,
    position: Number(row.position) as 1 | 2,
    slotKey: row.slot_key,
  }))

  return {
    settings: mapSettings(settingsRes.data),
    slots,
    rotation,
    profiles,
    profileById,
    members: profiles.map((p: any) => ({ ...p, attendanceEnabled: memberById.get(p.id) ?? false })),
  }
}

function validateDates(input: AttendancePreviewInput, settings: AttendanceSettings): AttendanceIssue[] {
  const issues: AttendanceIssue[] = []
  if (!input.cycleStart || !input.periodStart || !input.periodEnd) {
    issues.push({ severity: "error", code: "dates_missing", message: "Informe início do ciclo e período." })
    return issues
  }
  if (!isMonday(input.cycleStart)) {
    issues.push({ severity: "error", code: "cycle_not_monday", message: "O início do ciclo deve ser uma segunda-feira." })
  }
  if (input.cycleStart < settings.scheduleStartDate || input.periodStart < settings.scheduleStartDate) {
    issues.push({ severity: "error", code: "before_start", message: `A agenda operacional começa em ${settings.scheduleStartDate.split("-").reverse().join("/")}.` })
  }
  if (input.periodEnd < input.periodStart) {
    issues.push({ severity: "error", code: "invalid_period", message: "A data final deve ser igual ou posterior à inicial." })
  }
  if (input.periodStart < input.cycleStart) {
    issues.push({ severity: "warning", code: "period_before_cycle", message: "O período começa antes do marco do ciclo; o rodízio será calculado retroativamente." })
  }
  return issues
}

function buildOccurrence(
  date: string,
  weekIndex: number,
  entry: RotationEntry,
  activity: AttendanceActivity,
  startTime: string,
  endTime: string,
  settings: AttendanceSettings,
  slot: AttendanceSlot,
  profile: any,
  suffix: string,
): GeneratedOccurrence {
  const breakDef = activity === "room"
    ? (entry.lane === "room_early" ? settings.roomEarlyBreaks : entry.lane === "room_late" ? settings.roomLateBreaks : [])
      .find((b) => Number(b.position) === entry.position)
    : null
  const location = activity === "room" ? settings.roomLocation : activity === "conversion" ? settings.conversionLocation : settings.externalLocation
  return {
    seriesKey: `${entry.slotKey}:${entry.lane}:${entry.position}:${suffix}`,
    templateWeekIndex: weekIndex,
    slotKey: entry.slotKey,
    userId: slot.userId,
    responsibleName: profile?.full_name || slot.label,
    responsibleEmail: profile?.email || null,
    activity,
    date,
    startTime,
    endTime,
    breakStart: breakDef?.start || null,
    breakEnd: breakDef?.end || null,
    location,
    status: "draft",
  }
}

async function generateSuggested(input: AttendancePreviewInput) {
  const base = await loadSchedulingBase()
  const { settings, slots, rotation, profileById } = base
  const issues = validateDates(input, settings)
  if (issues.some((i) => i.severity === "error")) return { ...base, occurrences: [] as GeneratedOccurrence[], issues }

  const admin = createAdminClient()
  const { data: exceptions } = await admin
    .from("attendance_exceptions")
    .select("exception_date,closed,note,kind")
    .gte("exception_date", input.periodStart)
    .lte("exception_date", input.periodEnd)
  const closed = new Map((exceptions ?? []).filter((e: any) => e.closed).map((e: any) => [e.exception_date, e]))
  const slotByKey = new Map(slots.map((s) => [s.slotKey, s]))
  const occurrences: GeneratedOccurrence[] = []

  for (let date = input.periodStart; date <= input.periodEnd; date = addDays(date, 1)) {
    const weekday = weekdayOf(date)
    if (weekday === 0 || closed.has(date)) continue
    const weekIndex = weekIndexFor(input.cycleStart, date)

    if (weekday === 6) {
      for (const entry of rotation.filter((r) => r.weekIndex === weekIndex && r.lane === "saturday")) {
        const slot = slotByKey.get(entry.slotKey)
        if (!slot) continue
        occurrences.push(buildOccurrence(date, weekIndex, entry, "room", settings.saturdayStart, settings.saturdayEnd, settings, slot, slot.userId ? profileById.get(slot.userId) : null, "sat"))
      }
      continue
    }

    const entries = rotation.filter((r) => r.weekIndex === weekIndex && r.lane !== "saturday")
    for (const entry of entries) {
      const slot = slotByKey.get(entry.slotKey)
      if (!slot) continue
      const profile = slot.userId ? profileById.get(slot.userId) : null
      if (entry.lane === "room_early") {
        occurrences.push(buildOccurrence(date, weekIndex, entry, "room", settings.roomEarlyStart, settings.roomEarlyEnd, settings, slot, profile, "room-early"))
      } else if (entry.lane === "room_late") {
        occurrences.push(buildOccurrence(date, weekIndex, entry, "room", settings.roomLateStart, settings.roomLateEnd, settings, slot, profile, "room-late"))
      } else if (entry.lane === "conversion_am_external_pm") {
        occurrences.push(buildOccurrence(date, weekIndex, entry, "conversion", settings.morningStart, settings.morningEnd, settings, slot, profile, "am-conversion"))
        occurrences.push(buildOccurrence(date, weekIndex, entry, "external", settings.afternoonStart, settings.afternoonEnd, settings, slot, profile, "pm-external"))
      } else if (entry.lane === "external_am_conversion_pm") {
        occurrences.push(buildOccurrence(date, weekIndex, entry, "external", settings.morningStart, settings.morningEnd, settings, slot, profile, "am-external"))
        occurrences.push(buildOccurrence(date, weekIndex, entry, "conversion", settings.afternoonStart, settings.afternoonEnd, settings, slot, profile, "pm-conversion"))
      }
    }
  }

  const extraIssues = await validateOccurrences(occurrences, settings, input.periodStart, input.periodEnd)
  return { ...base, occurrences, issues: [...issues, ...extraIssues], exceptions: exceptions ?? [] }
}

async function validateOccurrences(occurrences: GeneratedOccurrence[], settings: AttendanceSettings, start: string, end: string): Promise<AttendanceIssue[]> {
  const issues: AttendanceIssue[] = []
  const admin = createAdminClient()

  for (const occ of occurrences) {
    if (!occ.userId) {
      issues.push({ severity: "error", code: "unlinked_slot", date: occ.date, message: `${occ.responsibleName} ainda não está vinculado a um usuário real.` })
    } else if (!validEmail(occ.responsibleEmail)) {
      issues.push({ severity: "error", code: "invalid_email", date: occ.date, message: `${occ.responsibleName} não possui e-mail válido no usuário do CRM.` })
    }
    if (timeToMinutes(occ.endTime) <= timeToMinutes(occ.startTime)) {
      issues.push({ severity: "error", code: "invalid_time", date: occ.date, message: `Horário inválido em ${occ.responsibleName}.` })
    }
  }

  // Sobreposição dentro da própria prévia.
  const byUserDay = new Map<string, GeneratedOccurrence[]>()
  for (const occ of occurrences.filter((o) => o.userId)) {
    const key = `${occ.userId}:${occ.date}`
    const list = byUserDay.get(key) ?? []
    list.push(occ)
    byUserDay.set(key, list)
  }
  for (const list of byUserDay.values()) {
    list.sort((a, b) => a.startTime.localeCompare(b.startTime))
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1], b = list[i]
      if (overlaps(a.startTime, a.endTime, b.startTime, b.endTime)) {
        issues.push({ severity: "error", code: "preview_overlap", date: b.date, message: `${b.responsibleName} ficou com atividades sobrepostas (${a.startTime}–${a.endTime} e ${b.startTime}–${b.endTime}).` })
      }
    }
  }

  // Cobertura da sala em blocos de 15 minutos, descontando intervalo.
  const dates = Array.from(new Set(occurrences.filter((o) => o.activity === "room").map((o) => o.date)))
  for (const date of dates) {
    const weekday = weekdayOf(date)
    const room = occurrences.filter((o) => o.date === date && o.activity === "room")
    if (weekday === 6) {
      if (room.length < 2) issues.push({ severity: "error", code: "saturday_coverage", date, message: "Sábado precisa de dois responsáveis na sala das 9h às 12h." })
      continue
    }
    const startM = timeToMinutes(settings.weekdayRoomOpen)
    const endM = timeToMinutes(settings.weekdayRoomClose)
    for (let minute = startM; minute < endM; minute += 15) {
      const active = room.filter((o) => {
        const inShift = timeToMinutes(o.startTime) <= minute && timeToMinutes(o.endTime) > minute
        if (!inShift) return false
        if (!o.breakStart || !o.breakEnd) return true
        return !(timeToMinutes(o.breakStart) <= minute && timeToMinutes(o.breakEnd) > minute)
      }).length
      if (active < settings.minRoomCoverage) {
        const hh = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`
        issues.push({ severity: "error", code: "room_coverage", date, message: `Cobertura da sala abaixo de ${settings.minRoomCoverage} pessoas em ${date.split("-").reverse().join("/")} às ${hh}.` })
        break
      }
    }
  }

  const userIds = Array.from(new Set(occurrences.map((o) => o.userId).filter(Boolean))) as string[]
  if (userIds.length) {
    const [existingRes, absenceRes, schoolRes, b2bRes] = await Promise.all([
      admin.from("attendance_occurrences").select("id,user_id,occurrence_date,start_time,end_time,status").in("user_id", userIds).gte("occurrence_date", start).lte("occurrence_date", end).neq("status", "cancelled"),
      admin.from("attendance_absences").select("user_id,absence_date,start_time,end_time,reason").in("user_id", userIds).gte("absence_date", start).lte("absence_date", end).eq("active", true),
      admin.from("school_actions").select("id,action_date,start_time,end_time,primary_owner_id,action_type,status").in("primary_owner_id", userIds).gte("action_date", start).lte("action_date", end).neq("status", "cancelada"),
      admin.from("activities").select("id,data,primary_owner_id,tipo,status").in("primary_owner_id", userIds).gte("data", start).lte("data", end),
    ])

    for (const occ of occurrences.filter((o) => o.userId)) {
      for (const ex of existingRes.data ?? []) {
        if (ex.user_id === occ.userId && ex.occurrence_date === occ.date && overlaps(occ.startTime, occ.endTime, padTime(ex.start_time), padTime(ex.end_time))) {
          issues.push({ severity: "warning", code: "existing_schedule", date: occ.date, message: `${occ.responsibleName} já possui compromisso da escala nesse horário.` })
          break
        }
      }
      for (const ab of absenceRes.data ?? []) {
        if (ab.user_id !== occ.userId || ab.absence_date !== occ.date) continue
        const conflict = !ab.start_time || !ab.end_time || overlaps(occ.startTime, occ.endTime, padTime(ab.start_time), padTime(ab.end_time))
        if (conflict) issues.push({ severity: "error", code: "absence", date: occ.date, message: `${occ.responsibleName} possui ausência registrada${ab.reason ? `: ${ab.reason}` : "."}` })
      }
      for (const sc of schoolRes.data ?? []) {
        if (sc.primary_owner_id !== occ.userId || sc.action_date !== occ.date) continue
        if (sc.start_time && sc.end_time && overlaps(occ.startTime, occ.endTime, padTime(sc.start_time), padTime(sc.end_time))) {
          issues.push({ severity: "warning", code: "school_action", date: occ.date, message: `${occ.responsibleName} tem ação de escola no mesmo horário.` })
        }
      }
      if ((b2bRes.data ?? []).some((a: any) => a.primary_owner_id === occ.userId && a.data === occ.date)) {
        issues.push({ severity: "warning", code: "b2b_activity", date: occ.date, message: `${occ.responsibleName} possui atividade B2B registrada neste dia; confira o horário manualmente.` })
      }
    }
  }

  // Deduplica mensagens equivalentes.
  const seen = new Set<string>()
  return issues.filter((issue) => {
    const key = `${issue.code}:${issue.date || ""}:${issue.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function previewSuggestedSchedule(input: AttendancePreviewInput): Promise<AttendanceActionResult> {
  try {
    await requireCan("attendance.manage")
    const preview = await generateSuggested(input)
    return { ok: true, message: "Prévia gerada. Nenhum convite foi enviado.", preview }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Falha ao gerar prévia." }
  }
}

export async function saveSuggestedDraft(input: AttendancePreviewInput, replaceDraftConflicts = false): Promise<AttendanceActionResult> {
  try {
    const actor = await requireCan("attendance.manage")
    const generated = await generateSuggested(input)
    const fatalDates = validateDates(input, generated.settings).filter((i) => i.severity === "error")
    if (fatalDates.length) return { ok: false, message: "Revise as datas antes de salvar.", issues: fatalDates }

    const admin = createAdminClient()
    if (replaceDraftConflicts) {
      await admin.from("attendance_occurrences").delete().eq("status", "draft").gte("occurrence_date", input.periodStart).lte("occurrence_date", input.periodEnd)
    }

    const { data: cycle, error: cycleError } = await admin.from("attendance_cycles").insert({
      name: `Escala ${input.periodStart} a ${input.periodEnd}`,
      cycle_start: input.cycleStart,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      status: "draft",
      created_by: actor.id,
    }).select("id").single()
    if (cycleError || !cycle) return { ok: false, message: `Falha ao criar rascunho: ${cycleError?.message ?? "erro desconhecido"}` }

    const rows = generated.occurrences.map((o) => ({
      cycle_id: cycle.id,
      series_key: o.seriesKey,
      template_week_index: o.templateWeekIndex,
      slot_key: o.slotKey,
      user_id: o.userId,
      activity: o.activity,
      occurrence_date: o.date,
      start_time: o.startTime,
      end_time: o.endTime,
      break_start: o.breakStart || null,
      break_end: o.breakEnd || null,
      location: o.location,
      notes: o.notes || null,
      status: "draft",
      created_by: actor.id,
      updated_by: actor.id,
    }))
    const { error } = await admin.from("attendance_occurrences").insert(rows)
    if (error) {
      await admin.from("attendance_cycles").delete().eq("id", cycle.id)
      return { ok: false, message: `Falha ao salvar ocorrências: ${error.message}` }
    }
    revalidatePath("/atendimento")
    return { ok: true, message: `${rows.length} compromissos salvos como rascunho. Nenhum e-mail foi enviado.`, cycleId: cycle.id, issues: generated.issues }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Falha ao salvar rascunho." }
  }
}

export async function getAttendanceData(input?: { start?: string; end?: string; userId?: string; activity?: string; status?: string }) {
  const actor = await requireCan("attendance.read")
  const manager = can(actor.role, "attendance.manage")
  const admin = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)
  const start = input?.start || mondayOf(today)
  const end = input?.end || addDays(start, 34)
  const base = await loadSchedulingBase()

  let query = admin.from("attendance_occurrences").select("*").gte("occurrence_date", start).lte("occurrence_date", end).order("occurrence_date").order("start_time")
  if (!manager) query = query.eq("user_id", actor.id).in("status", ["published", "cancelled"])
  if (manager && input?.userId) query = query.eq("user_id", input.userId)
  if (input?.activity) query = query.eq("activity", input.activity)
  if (input?.status) query = query.eq("status", input.status)
  const { data: occurrenceRows, error } = await query
  if (error) throw new Error(error.message)

  const profileById = new Map(base.profiles.map((p: any) => [p.id, p]))
  const occurrenceIds = (occurrenceRows ?? []).map((o: any) => o.id)
  const { data: events } = occurrenceIds.length
    ? await admin.from("calendar_events").select("id,source_id,recipient_user_id,status,sequence").eq("source_type", "attendance").in("source_id", occurrenceIds)
    : { data: [] as any[] }
  const eventIds = (events ?? []).map((e: any) => e.id)
  const { data: jobs } = eventIds.length
    ? await admin.from("calendar_invite_jobs").select("id,calendar_event_id,operation,status,last_error,sent_at,created_at,event_sequence").in("calendar_event_id", eventIds).order("created_at", { ascending: false })
    : { data: [] as any[] }
  const latestJobByEvent = new Map<string, any>()
  for (const job of jobs ?? []) if (!latestJobByEvent.has(job.calendar_event_id)) latestJobByEvent.set(job.calendar_event_id, job)
  const eventBySource = new Map((events ?? []).map((e: any) => [e.source_id, { ...e, invite: latestJobByEvent.get(e.id) || null }]))

  const occurrences = (occurrenceRows ?? []).map((o: any) => {
    const p: any = o.user_id ? profileById.get(o.user_id) : null
    return {
      id: o.id,
      cycleId: o.cycle_id,
      seriesKey: o.series_key,
      templateWeekIndex: o.template_week_index,
      slotKey: o.slot_key,
      userId: o.user_id,
      responsibleName: p?.full_name || base.slots.find((s) => s.slotKey === o.slot_key)?.label || "Sem responsável",
      responsibleEmail: p?.email || null,
      activity: o.activity,
      date: o.occurrence_date,
      startTime: padTime(o.start_time),
      endTime: padTime(o.end_time),
      breakStart: o.break_start ? padTime(o.break_start) : null,
      breakEnd: o.break_end ? padTime(o.break_end) : null,
      location: o.location,
      notes: o.notes,
      status: o.status,
      eventUid: o.event_uid,
      sequence: o.sequence,
      invite: eventBySource.get(o.id)?.invite || null,
    }
  })

  const providerStatus = await getCalendarProviderStatus(false)
  return { actor, manager, start, end, ...base, occurrences, providerStatus }
}

export async function updateTeamSlot(slotKey: string, userId: string | null): Promise<AttendanceActionResult> {
  try {
    const actor = await requireCan("attendance.manage")
    const admin = createAdminClient()
    if (userId) {
      const { data: profile } = await admin.from("profiles").select("id,active").eq("id", userId).maybeSingle()
      if (!profile?.active) return { ok: false, message: "Usuário inválido ou inativo." }
      await admin.from("attendance_members").upsert({ user_id: userId, enabled: true, created_by: actor.id }, { onConflict: "user_id" })
    }
    const { error } = await admin.from("attendance_team_slots").update({ user_id: userId, updated_by: actor.id }).eq("slot_key", slotKey)
    if (error) return { ok: false, message: error.message }
    revalidatePath("/atendimento")
    return { ok: true, message: "Vinculação atualizada." }
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Falha ao vincular." } }
}

export async function setAttendanceMember(userId: string, enabled: boolean): Promise<AttendanceActionResult> {
  try {
    const actor = await requireCan("attendance.manage")
    const admin = createAdminClient()
    const { error } = await admin.from("attendance_members").upsert({ user_id: userId, enabled, created_by: actor.id }, { onConflict: "user_id" })
    if (error) return { ok: false, message: error.message }
    revalidatePath("/atendimento")
    return { ok: true, message: enabled ? "Usuário incluído no Atendimento." : "Usuário removido da lista de Atendimento." }
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Falha ao atualizar usuário." } }
}

export async function saveOccurrence(input: {
  id?: string
  scope?: "occurrence" | "week" | "future"
  userId?: string | null
  activity: AttendanceActivity
  date: string
  startTime: string
  endTime: string
  breakStart?: string | null
  breakEnd?: string | null
  location?: string | null
  notes?: string | null
}): Promise<AttendanceActionResult> {
  try {
    const actor = await requireCan("attendance.manage")
    const base = await loadSchedulingBase()
    if (input.date < base.settings.scheduleStartDate) return { ok: false, message: `A agenda começa em ${base.settings.scheduleStartDate.split("-").reverse().join("/")}.` }
    if (timeToMinutes(input.endTime) <= timeToMinutes(input.startTime)) return { ok: false, message: "O horário final deve ser posterior ao inicial." }
    if (input.breakStart && input.breakEnd && (timeToMinutes(input.breakEnd) <= timeToMinutes(input.breakStart) || timeToMinutes(input.breakStart) < timeToMinutes(input.startTime) || timeToMinutes(input.breakEnd) > timeToMinutes(input.endTime))) {
      return { ok: false, message: "O intervalo precisa estar dentro do compromisso e ter início anterior ao fim." }
    }
    const admin = createAdminClient()
    const payload = {
      user_id: input.userId || null,
      activity: input.activity,
      occurrence_date: input.date,
      start_time: input.startTime,
      end_time: input.endTime,
      break_start: input.breakStart || null,
      break_end: input.breakEnd || null,
      location: input.location || null,
      notes: input.notes || null,
      updated_by: actor.id,
    }

    if (!input.id) {
      const { data, error } = await admin.from("attendance_occurrences").insert({ ...payload, status: "draft", created_by: actor.id, series_key: `manual:${crypto.randomUUID()}` }).select("id").single()
      if (error || !data) return { ok: false, message: error?.message || "Falha ao criar compromisso." }
      revalidatePath("/atendimento")
      return { ok: true, message: "Compromisso criado como rascunho.", id: data.id }
    }

    const { data: current, error: readError } = await admin.from("attendance_occurrences").select("*").eq("id", input.id).single()
    if (readError || !current) return { ok: false, message: "Compromisso não encontrado." }
    const scope = input.scope || "occurrence"
    let targetRows: any[] = [current]
    if (scope !== "occurrence" && current.cycle_id && current.series_key) {
      let q = admin.from("attendance_occurrences").select("*").eq("cycle_id", current.cycle_id).eq("series_key", current.series_key).neq("status", "cancelled")
      if (scope === "week") q = q.gte("occurrence_date", mondayOf(current.occurrence_date)).lte("occurrence_date", sundayOf(current.occurrence_date))
      else q = q.gte("occurrence_date", current.occurrence_date)
      const { data } = await q
      targetRows = data ?? [current]
    }

    for (const row of targetRows) {
      const update: any = { ...payload }
      if (scope !== "occurrence") delete update.occurrence_date
      if (row.status === "published") update.sequence = Number(row.sequence || 0) + 1
      const { error } = await admin.from("attendance_occurrences").update(update).eq("id", row.id)
      if (error) return { ok: false, message: error.message }
      if (row.status === "published") {
        const effectiveDate = scope === "occurrence" ? input.date : row.occurrence_date
        await syncCalendarEvent({
          sourceType: "attendance",
          sourceId: row.id,
          recipientUserId: input.userId || null,
          title: `UniConecta · ${ACTIVITY_LABEL[input.activity]}`,
          startAt: saoPauloIso(effectiveDate, input.startTime),
          endAt: saoPauloIso(effectiveDate, input.endTime),
          location: input.location,
          description: [input.breakStart && input.breakEnd ? `Intervalo: ${input.breakStart}–${input.breakEnd}` : null, input.notes].filter(Boolean).join("\n"),
          crmPath: "/atendimento/minha-agenda",
          actorId: actor.id,
        })
      }
    }
    revalidatePath("/atendimento")
    revalidatePath("/atendimento/minha-agenda")
    return { ok: true, message: `${targetRows.length} ocorrência(s) atualizada(s).`, count: targetRows.length }
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Falha ao salvar compromisso." } }
}

export async function publishCycle(cycleId: string): Promise<AttendanceActionResult> {
  try {
    const actor = await requireCan("attendance.manage")
    const admin = createAdminClient()
    const { data: cycle } = await admin.from("attendance_cycles").select("*").eq("id", cycleId).single()
    if (!cycle) return { ok: false, message: "Rascunho não encontrado." }
    const { data: rows, error } = await admin.from("attendance_occurrences").select("*").eq("cycle_id", cycleId).neq("status", "cancelled").order("occurrence_date").order("start_time")
    if (error) return { ok: false, message: error.message }
    const base = await loadSchedulingBase()
    const profileById = new Map(base.profiles.map((p: any) => [p.id, p]))
    const generated: GeneratedOccurrence[] = (rows ?? []).map((o: any) => ({
      id: o.id, cycleId: o.cycle_id, seriesKey: o.series_key, templateWeekIndex: o.template_week_index, slotKey: o.slot_key,
      userId: o.user_id, responsibleName: profileById.get(o.user_id)?.full_name || base.slots.find((s) => s.slotKey === o.slot_key)?.label || "Sem responsável",
      responsibleEmail: profileById.get(o.user_id)?.email || null, activity: o.activity, date: o.occurrence_date,
      startTime: padTime(o.start_time), endTime: padTime(o.end_time), breakStart: o.break_start ? padTime(o.break_start) : null,
      breakEnd: o.break_end ? padTime(o.break_end) : null, location: o.location || "", notes: o.notes, status: o.status,
    }))
    const issues = await validateOccurrences(generated, base.settings, cycle.period_start, cycle.period_end)
    const errors = issues.filter((i) => i.severity === "error" && i.code !== "existing_schedule")
    // Ao validar um ciclo já salvo, seus próprios rascunhos aparecem como existing_schedule; isso não bloqueia.
    if (errors.length) return { ok: false, message: "A escala possui pendências que impedem a publicação.", issues: errors }

    const now = new Date().toISOString()
    for (const row of rows ?? []) {
      const p: any = row.user_id ? profileById.get(row.user_id) : null
      if (!p || !validEmail(p.email)) return { ok: false, message: "Todos os compromissos precisam de usuário real com e-mail válido antes da publicação." }
      await admin.from("attendance_occurrences").update({ status: "published", published_by: actor.id, published_at: now, updated_by: actor.id }).eq("id", row.id)
      await syncCalendarEvent({
        sourceType: "attendance",
        sourceId: row.id,
        recipientUserId: row.user_id,
        title: `UniConecta · ${ACTIVITY_LABEL[row.activity as AttendanceActivity]}`,
        startAt: saoPauloIso(row.occurrence_date, padTime(row.start_time)),
        endAt: saoPauloIso(row.occurrence_date, padTime(row.end_time)),
        location: row.location,
        description: [row.break_start && row.break_end ? `Intervalo: ${padTime(row.break_start)}–${padTime(row.break_end)}` : null, row.notes].filter(Boolean).join("\n"),
        crmPath: "/atendimento/minha-agenda",
        actorId: actor.id,
      })
    }
    await admin.from("attendance_cycles").update({ status: "published", published_by: actor.id, published_at: now }).eq("id", cycleId)
    const dispatch = await processCalendarQueue()
    revalidatePath("/atendimento")
    revalidatePath("/atendimento/minha-agenda")
    // Publicar a escala e entregar os convites são resultados independentes.
    // Os contadores são da fila global, não apenas do ciclo publicado.
    const message = dispatch.error
      ? "Escala publicada. Houve uma falha no processamento dos convites; consulte o status de cada compromisso."
      : !dispatch.configured
        ? "Escala publicada. Os convites ficaram pendentes porque o provedor de e-mail ainda não está configurado."
        : Number(dispatch.failed || 0) > 0
          ? `Escala publicada. Processamento da fila: ${Number(dispatch.sent || 0)} enviado(s) ao provedor e ${Number(dispatch.failed)} com falha. Consulte o status de cada compromisso.`
          : Number(dispatch.sent || 0) > 0
            ? `Escala publicada. Processamento da fila: ${Number(dispatch.sent)} convite(s) enviado(s) ao provedor. Confira o status de cada compromisso e o recebimento no Outlook.`
            : "Escala publicada. Nenhum novo envio foi confirmado nesta execução; consulte o status de cada compromisso."
    return { ok: true, message, issues, dispatch }
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Falha ao publicar escala." } }
}

export async function cancelOccurrence(id: string): Promise<AttendanceActionResult> {
  try {
    const actor = await requireCan("attendance.manage")
    const admin = createAdminClient()
    const { data: row } = await admin.from("attendance_occurrences").select("*").eq("id", id).single()
    if (!row) return { ok: false, message: "Compromisso não encontrado." }
    await admin.from("attendance_occurrences").update({ status: "cancelled", cancelled_at: new Date().toISOString(), updated_by: actor.id, sequence: Number(row.sequence || 0) + 1 }).eq("id", id)
    if (row.status === "published") {
      await syncCalendarEvent({ sourceType: "attendance", sourceId: row.id, recipientUserId: row.user_id, title: `UniConecta · ${ACTIVITY_LABEL[row.activity as AttendanceActivity]}`, startAt: saoPauloIso(row.occurrence_date, padTime(row.start_time)), endAt: saoPauloIso(row.occurrence_date, padTime(row.end_time)), actorId: actor.id, cancel: true })
      await processCalendarQueue()
    }
    revalidatePath("/atendimento")
    return { ok: true, message: "Compromisso cancelado. Se já estava publicado, o cancelamento foi enfileirado para o calendário." }
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Falha ao cancelar." } }
}

export async function getCalendarProviderStatus(requirePermission = true): Promise<any> {
  try {
    if (requirePermission) await requireCan("attendance.read")
    const supabase = await createClient()
    const { data, error } = await supabase.functions.invoke("send-calendar-invites", { body: { action: "status" } })
    if (error || !data?.ok) return { configured: false, error: "Não foi possível consultar o provedor de e-mail.", message: "Não foi possível consultar o provedor de e-mail." }
    return data
  } catch {
    return { configured: false, error: "Não foi possível consultar o provedor de e-mail.", message: "Não foi possível consultar o provedor de e-mail." }
  }
}

export async function processCalendarQueue(): Promise<any> {
  try {
    await requireCan("attendance.manage")
    const supabase = await createClient()
    const status = await getCalendarProviderStatus(false)
    if (status?.error) return { configured: false, error: status.error, status }
    if (!status?.configured) return { configured: false, status }
    let totalSent = 0, totalFailed = 0, totalProcessed = 0
    for (let i = 0; i < 4; i++) {
      const { data, error } = await supabase.functions.invoke("send-calendar-invites", { body: { action: "process", limit: 50 } })
      if (error) return { configured: true, error: error.message, sent: totalSent, failed: totalFailed }
      if (!data?.ok) return { configured: true, error: "O provedor não confirmou o processamento dos convites.", sent: totalSent, failed: totalFailed }
      totalSent += Number(data?.sent || 0); totalFailed += Number(data?.failed || 0); totalProcessed += Number(data?.processed || 0)
      if (Number(data?.processed || 0) < 50) break
    }
    revalidatePath("/atendimento")
    return { configured: true, sent: totalSent, failed: totalFailed, processed: totalProcessed }
  } catch (e) {
    return { configured: false, error: e instanceof Error ? e.message : "Falha ao processar fila." }
  }
}

export async function saveAttendanceSettings(input: Partial<AttendanceSettings>): Promise<AttendanceActionResult> {
  try {
    const actor = await requireCan("attendance.manage")
    const admin = createAdminClient()
    const patch: any = { updated_by: actor.id }
    const map: Record<string, string> = {
      scheduleStartDate: "schedule_start_date", weekdayRoomOpen: "weekday_room_open", weekdayRoomClose: "weekday_room_close",
      roomEarlyStart: "room_early_start", roomEarlyEnd: "room_early_end", roomLateStart: "room_late_start", roomLateEnd: "room_late_end",
      morningStart: "morning_start", morningEnd: "morning_end", afternoonStart: "afternoon_start", afternoonEnd: "afternoon_end",
      saturdayStart: "saturday_start", saturdayEnd: "saturday_end", minRoomCoverage: "min_room_coverage", roomLocation: "room_location",
      conversionLocation: "conversion_location", externalLocation: "external_location", roomEarlyBreaks: "room_early_breaks", roomLateBreaks: "room_late_breaks",
    }
    for (const [key, column] of Object.entries(map)) if ((input as any)[key] !== undefined) patch[column] = (input as any)[key]
    const { error } = await admin.from("attendance_settings").update(patch).eq("id", 1)
    if (error) return { ok: false, message: error.message }
    revalidatePath("/atendimento")
    return { ok: true, message: "Horários e parâmetros atualizados." }
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Falha ao salvar configuração." } }
}

export async function saveAttendanceException(input: { date: string; closed: boolean; kind?: string; note?: string }): Promise<AttendanceActionResult> {
  try {
    const actor = await requireCan("attendance.manage")
    const admin = createAdminClient()
    const { error } = await admin.from("attendance_exceptions").upsert({ exception_date: input.date, closed: input.closed, kind: input.kind || "closed", note: input.note || null, created_by: actor.id }, { onConflict: "exception_date" })
    if (error) return { ok: false, message: error.message }
    revalidatePath("/atendimento")
    return { ok: true, message: "Exceção registrada." }
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Falha ao registrar exceção." } }
}

export async function saveAbsence(input: { userId: string; date: string; startTime?: string; endTime?: string; reason?: string }): Promise<AttendanceActionResult> {
  try {
    const actor = await requireCan("attendance.manage")
    const admin = createAdminClient()
    const { error } = await admin.from("attendance_absences").insert({ user_id: input.userId, absence_date: input.date, start_time: input.startTime || null, end_time: input.endTime || null, reason: input.reason || null, created_by: actor.id })
    if (error) return { ok: false, message: error.message }
    revalidatePath("/atendimento")
    return { ok: true, message: "Ausência registrada." }
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Falha ao registrar ausência." } }
}
