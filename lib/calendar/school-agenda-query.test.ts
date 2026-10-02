import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ actor: { id: "10000000-0000-0000-0000-000000000001", role: "high_school" }, queries: [] as any[] }))
const other = "10000000-0000-0000-0000-000000000002"
const action = "40000000-0000-0000-0000-000000000001"
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/guards", () => ({ requireCan: vi.fn(async () => state.actor), requireActor: vi.fn(async () => state.actor) }))
vi.mock("@/lib/calendar/calendar-sync", () => ({ saoPauloIso: vi.fn(), syncCalendarEvent: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ functions: { invoke: async () => ({ data: { ok: true, configured: false }, error: null }) } }) }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => {
  const filters: any[] = []
  let single = false
  const query: any = {
    select: () => query, order: () => query,
    eq: (column: string, value: any) => { filters.push(["eq", column, value]); return query },
    in: (column: string, value: any) => { filters.push(["in", column, value]); return query },
    gte: (column: string, value: any) => { filters.push(["gte", column, value]); return query },
    lte: (column: string, value: any) => { filters.push(["lte", column, value]); return query },
    or: (value: string) => { filters.push(["or", "", value]); return query },
    single: () => { single = true; return query },
    then: (resolve: any) => {
      const mine = "10000000-0000-0000-0000-000000000001"
      const school = { name: "Escola compartilhada", primary_owner_id: null }
      const fixture: Record<string, any[]> = {
        profiles: [{ id: mine, full_name: "Principal", active: true }, { id: other, full_name: "Apoio", active: true }],
        attendance_occurrences: [mine, other].flatMap((id) => ["published", "draft"].map((status) => ({ id: `${id}:${status}`, user_id: id, status, occurrence_date: "2026-10-06", start_time: "09:00", end_time: "10:00", activity: "room" }))),
        school_action_participants: [{ school_action_id: action, user_id: mine }, { school_action_id: action, user_id: other }],
        school_actions: [{ id: action, primary_owner_id: other, school_id: "school", school, action_date: "2026-10-06", start_time: "14:30", end_time: "15:30", status: "reagendada", school_action_participants: [{ user_id: mine }, { user_id: other }] },
          { id: "40000000-0000-0000-0000-000000000002", primary_owner_id: other, school_id: "unrelated", school, action_date: "2026-10-06", status: "agendada", school_action_participants: [] }],
      }
      const data = (fixture[table] || []).filter((row) => filters.every(([kind, column, value]) => {
        if (kind === "eq") return row[column] === value
        if (kind === "in") return value.includes(row[column])
        if (kind === "gte") return row[column] >= value
        if (kind === "lte") return row[column] <= value
        if (kind === "or") return value.includes(`primary_owner_id.eq.${row.primary_owner_id}`) || value.includes(row.id)
        return true
      }))
      state.queries.push({ table, filters })
      return Promise.resolve({ data: single ? data[0] || null : data, error: null }).then(resolve)
    },
  }
  return query
} }) }))

import { getAttendanceData } from "@/app/actions/attendance"

describe("escopo da consulta das agendas", () => {
  beforeEach(() => { state.actor.role = "high_school"; state.queries = [] })
  it("um consultor lê suas ações de apoio sem poder pedir a agenda de outro usuário", async () => {
    const result = await getAttendanceData({ start: "2026-10-05", end: "2026-10-11", userId: other })
    expect(result.occurrences.filter((o) => o.sourceType === "school_action").map((o) => o.id)).toEqual([action])
    expect(result.occurrences.filter((o) => o.sourceType === "attendance").map((o) => o.userId)).toEqual([state.actor.id])
    expect(state.queries.find((q) => q.table === "school_action_participants").filters).toContainEqual(["eq", "user_id", state.actor.id])
    expect(result.schoolOptions).toEqual([{ id: "school", name: "Escola compartilhada" }])
  })
  it("a gestão filtra pelo participante e mantém cada ação uma única vez", async () => {
    state.actor.role = "gerente"
    const result = await getAttendanceData({ start: "2026-10-05", end: "2026-10-11", userId: state.actor.id, activity: "school" })
    expect(result.occurrences.map((o) => o.id)).toEqual([action])
    expect(result.occurrences[0]).toMatchObject({ sourceType: "school_action", schoolStatus: "reagendada", startTime: "14:30" })
    await expect(getAttendanceData({ userId: "invalid,input" })).rejects.toThrow("Consultor inválido")
  })
})
