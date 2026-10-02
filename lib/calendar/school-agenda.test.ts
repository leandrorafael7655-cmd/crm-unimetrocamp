import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { describe, expect, it } from "vitest"
import { mapSchoolAgendaOccurrence, matchesAgendaFilters, saoPauloToday } from "../domain/school-agenda"

const principal = "10000000-0000-0000-0000-000000000001"
const support = "10000000-0000-0000-0000-000000000002"
const schoolId = "20000000-0000-0000-0000-000000000001"
const cycleId = "30000000-0000-0000-0000-000000000001"
const actionId = "40000000-0000-0000-0000-000000000001"
const row = {
  id: actionId, school_id: schoolId, primary_owner_id: principal, primary_owner_name: "Rafael",
  supervest_cycle_id: cycleId, cycle: { name: "SuperVestibular 2027" },
  school: { name: "Escola sem responsável fixo", primary_owner_id: null, logradouro: "Rua antiga" },
  school_action_participants: [{ user_id: support, user_name: "Ramon", role_in_action: "Apoio" }],
  action_date: "2026-10-06", start_time: "14:30:00", end_time: "15:30:00", status: "reagendada",
  action_type: "Divulgação SuperVestibular", location: "Auditório definido na ação",
}

describe("ações escolares na agenda do consultor", () => {
  it("mantém o identificador, a escola, o local, o horário e a participação de apoio", () => {
    const event = mapSchoolAgendaOccurrence(row, new Map())
    expect(event).toMatchObject({ id: actionId, schoolId, schoolName: row.school.name,
      location: row.location, startTime: "14:30", endTime: "15:30", schoolStatus: "reagendada" })
    expect(matchesAgendaFilters(event, { userId: principal })).toBe(true)
    expect(matchesAgendaFilters(event, { userId: support, activity: "school", status: "reagendada", schoolId, schoolCycleId: cycleId })).toBe(true)
    expect(matchesAgendaFilters(event, { userId: "outro" })).toBe(false)
    expect(matchesAgendaFilters(event, { schoolId: "outra" })).toBe(false)
    expect(matchesAgendaFilters(event, { schoolCycleId: "outra" })).toBe(false)
    expect(matchesAgendaFilters(event, {})).toBe(true)
    expect(matchesAgendaFilters(mapSchoolAgendaOccurrence({ ...row, status: "cancelada" }, new Map()), { status: "cancelled" })).toBe(true)
  })

  it("deduplica o principal e considera a data local antes da meia-noite em São Paulo", () => {
    const event = mapSchoolAgendaOccurrence({ ...row, school_action_participants: [...row.school_action_participants, { user_id: principal }] }, new Map())
    expect(event.participants).toHaveLength(2)
    expect(saoPauloToday(new Date("2026-10-03T01:00:00Z"))).toBe("2026-10-02")
  })

  it("sincroniza cada participante, reagenda e cancela preservando UIDs e histórico", async () => {
    const db = new PGlite()
    try {
      await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;
        create function auth.uid() returns uuid language sql as $$select null::uuid$$;
        create table profiles(id uuid primary key,full_name text);
        create table schools(id uuid primary key,name text,logradouro text,numero text,cidade text,primary_owner_id uuid);
        create table supervest_cycles(id uuid primary key,name text);
        create table school_actions(id uuid primary key,school_id uuid,supervest_cycle_id uuid,primary_owner_id uuid,created_by uuid,
          action_date date,start_time time,end_time time,status text,action_type text,location text,objective text,notes text);
        create table school_action_participants(school_action_id uuid references school_actions on delete cascade,user_id uuid references profiles,role_in_action text,primary key(school_action_id,user_id));
        insert into profiles values('${principal}','Rafael'),('${support}','Ramon');
        insert into schools values('${schoolId}','Escola sem responsável','Rua antiga','10','Campinas',null);
        insert into supervest_cycles values('${cycleId}','SuperVestibular 2027');`)
      const tables = readFileSync(new URL("../../supabase/migrations/011_attendance_members_and_calendar_invites.sql", import.meta.url), "utf8")
      await db.exec(tables.slice(tables.indexOf("create table if not exists public.calendar_events"), tables.indexOf("-- updated_at dos membros")))
      const helpers = readFileSync(new URL("../../supabase/migrations/012_calendar_sync_school_company_actions.sql", import.meta.url), "utf8")
      await db.exec(helpers.slice(helpers.indexOf("create or replace function public.queue_calendar_invite_job"), helpers.indexOf("create or replace function public.sync_school_action_calendar_trigger")))
      await db.exec(readFileSync(new URL("../../supabase/migrations/20261002145415_school_actions_personal_agenda.sql", import.meta.url), "utf8"))
      await db.exec(`begin;
        insert into school_actions values('${actionId}','${schoolId}','${cycleId}','${principal}','${principal}',
          '2098-10-05','10:00','11:00','agendada','Divulgação SuperVestibular','Auditório definido na ação','Teste','Observações');
        insert into school_action_participants values('${actionId}','${support}','Apoio'),('${actionId}','${principal}','Principal');
        commit;`)
      const events = () => db.query<any>("select *,to_char(start_at at time zone 'America/Sao_Paulo','YYYY-MM-DD HH24:MI') as local_start from calendar_events order by recipient_user_id")
      const initial = (await events()).rows
      expect(initial).toHaveLength(2)
      expect(initial.every((e) => e.status === "active" && e.location === "Auditório definido na ação" && e.sequence === 0)).toBe(true)
      expect(initial[0].title).toContain("Escola sem responsável")
      expect(initial[0].description).toContain("SuperVestibular 2027")
      expect((await db.query("select * from calendar_invite_jobs")).rows).toHaveLength(2)

      // O formulário altera ação e participantes na mesma transação: nada fica duplicado.
      await db.exec(`begin;update school_actions set action_date='2098-10-06',start_time='14:30',end_time='15:30',status='reagendada' where id='${actionId}';
        delete from school_action_participants where user_id='${support}';
        insert into school_action_participants values('${actionId}','${support}','Apoio');commit;`)
      const rescheduled = (await events()).rows
      expect(rescheduled.map((e) => e.event_uid)).toEqual(initial.map((e) => e.event_uid))
      expect(rescheduled.every((e) => e.sequence === 1 && e.status === "active" && e.local_start.includes("2098-10-06 14:30"))).toBe(true)
      expect((await db.query("select * from calendar_invite_jobs")).rows).toHaveLength(4)
      await db.exec(`update school_actions set notes=notes where id='${actionId}'`)
      expect((await db.query("select * from calendar_invite_jobs")).rows).toHaveLength(4)

      await db.exec(`delete from school_action_participants where user_id='${support}'`)
      const removed = (await events()).rows
      expect(removed.find((e) => e.recipient_user_id === principal)?.status).toBe("active")
      expect(removed.find((e) => e.recipient_user_id === support)?.status).toBe("cancelled")
      await db.exec(`insert into school_action_participants values('${actionId}','${support}','Apoio')`)
      expect((await events()).rows.map((e) => e.event_uid)).toEqual(initial.map((e) => e.event_uid))
      await db.exec(`update school_actions set status='cancelada' where id='${actionId}'`)
      expect((await events()).rows.every((e) => e.status === "cancelled")).toBe(true)
      expect((await db.query("select * from school_actions")).rows).toHaveLength(1)
      const jobCount = (await db.query("select * from calendar_invite_jobs")).rows.length
      await db.exec(`update school_actions set status='cancelada' where id='${actionId}'`)
      expect((await db.query("select * from calendar_invite_jobs")).rows).toHaveLength(jobCount)
      const permissions = await db.query<{ allowed: boolean }>("select has_function_privilege('authenticated','private.sync_school_action_calendar(uuid)','execute') as allowed")
      expect(permissions.rows[0].allowed).toBe(false)
    } finally { await db.close() }
  }, 20000)
})
