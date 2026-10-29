import { beforeAll, beforeEach, afterAll, expect, it } from "vitest"
import type { PGlite } from "@electric-sql/pglite"
import { createAuditedDatabase, asUser, TEST_USERS as U } from "./audited-database"
const C = "20000000-0000-4000-8000-000000000001", S = "20000000-0000-4000-8000-000000000002", CY = "20000000-0000-4000-8000-000000000003"
let db: PGlite
const root = async () => db.exec("reset role;select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','',false),set_config('request.jwt.claims','{}',false)")
beforeAll(async () => { db = await createAuditedDatabase() }, 60000)
afterAll(async () => { await db?.close() })
beforeEach(async () => {
  await root()
  await db.exec(`truncate private.external_calendar_reservations,companies,schools,calendar_events,calendar_invite_jobs,attendance_occurrences,commercial_cycles cascade;
    insert into companies(id,razao_social,owner_id) values('${C}','Empresa fictícia','${U.b2b}');
    insert into schools(id,name,created_by) values('${S}','Escola fictícia','${U.hs}');
    insert into commercial_cycles(id,name,start_at,end_at) values('${CY}','2099.1','2098-10-01','2099-04-30');`)
})
const result = (revision = 0, registrations: number | null = 0) => db.query(`select save_b2b_result($1,$2,$3,10,$4,'Teste fictício',$5)`, [C, U.b2b, CY, registrations, revision])
const meetingPayload = (start = "2098-11-03T12:00:00Z", end = "2098-11-03T13:00:00Z") => ({ company_id: C, company_name: "Fictícia", contact_id: null, contact_name: "Contato", contact_email: "external@example.invalid", organizer_user_id: U.b2b, organizer_name: "Teste B2B", organizer_email: "b2b@example.invalid", date: "2098-11-03", title: "Reunião fictícia", description: "Teste", meeting_type: "presencial", calendar_provider: "email", start_at: start, end_at: end, location: "Fictício", participants: [], email_sender: "agenda@example.invalid" })
async function meeting(id = crypto.randomUUID(), revision = 0, operation = "create", payload: object = meetingPayload()) {
  return db.query(`select * from b2b_stage_meeting($1,$2,$3,$4,$5)`, [id, U.b2b, revision, operation, JSON.stringify(payload)])
}
it("manual results keep measured zero, null, author, revision and immutable history", async () => {
  await asUser(db, U.gerente); await result(); await result(1, null)
  expect((await db.query(`select registrations,revision,changed_by from b2b_cycle_results`)).rows[0]).toEqual({ registrations: null, revision: 2, changed_by: U.gerente })
  const history = (await db.query<any>(`select previous_values,new_values,changed_by from b2b_result_history order by changed_at,id`)).rows
  expect(history).toHaveLength(2)
  expect(history.some(row => row.previous_values?.registrations === 0 && row.new_values.registrations === null)).toBe(true)
  await expect(db.exec(`delete from b2b_result_history`)).rejects.toThrow()
})
it("permissive provider defaults do not grant truncate or audit writes to browser roles", async () => {
  for (const table of ["b2b_cycle_results", "b2b_result_history", "commercial_archive_history"]) {
    expect((await db.query<{ allowed: boolean }>(`select has_table_privilege('authenticated',$1,'TRUNCATE') as allowed`, [table])).rows[0].allowed).toBe(false)
    expect((await db.query<{ allowed: boolean }>(`select has_table_privilege('anon',$1,'SELECT') as allowed`, [table])).rows[0].allowed).toBe(false)
  }
  for (const table of ["b2b_result_history", "commercial_archive_history"])
    expect((await db.query<{ allowed: boolean }>(`select has_table_privilege('authenticated',$1,'INSERT,UPDATE,DELETE') as allowed`, [table])).rows[0].allowed).toBe(false)
})
it.each(["supervisor", "b2b", "hs"] as const)("manual launch denied to %s at RPC and table level", async role => {
  await asUser(db, U[role]); await expect(result()).rejects.toThrow()
  await expect(db.query(`insert into b2b_cycle_results(company_id,user_id,commercial_cycle_id,target_value,changed_by) values($1,$2,$3,2,$2)`, [C, U.b2b, CY])).rejects.toThrow()
})
it("own results and history are isolated; stale revision cannot overwrite", async () => {
  await asUser(db, U.gerente); await result()
  await expect(result(0, 99)).rejects.toThrow(/alterado/)
  await asUser(db, U.outro); expect((await db.query(`select * from b2b_cycle_results`)).rows).toHaveLength(0)
  expect((await db.query(`select * from b2b_result_history`)).rows).toHaveLength(0)
  await asUser(db, U.b2b); expect((await db.query(`select registrations from b2b_cycle_results`)).rows).toEqual([{ registrations: 0 }])
})
it("company archive preserves agreement, activity, IDs and history and can be reactivated", async () => {
  await db.query(`insert into agreements(company_id,ativo) values($1,true)`, [C])
  await asUser(db, U.b2b); await db.query(`select set_commercial_archive('company',$1,true,'Encerrada')`, [C])
  expect((await db.query(`select id from companies where archived_at is not null`)).rows).toEqual([{ id: C }])
  expect((await db.query(`select id from b2b_company_portfolio`)).rows).toHaveLength(0)
  expect((await db.query(`select ativo from agreements where company_id=$1`, [C])).rows).toEqual([{ ativo: true }])
  await db.query(`select set_commercial_archive('company',$1,false,'Retomar')`, [C])
  expect((await db.query(`select id from b2b_company_portfolio`)).rows).toEqual([{ id: C }])
  expect((await db.query(`select * from commercial_archive_history where entity_id=$1`, [C])).rows).toHaveLength(2)
  await root(); await expect(db.query(`delete from companies where id=$1`, [C])).rejects.toThrow(/física proibida/)
})
it("school archive preserves contacts, supports reactivation, and denies physical deletion", async () => {
  await db.query(`insert into school_contacts(school_id,name) values($1,'Contato fictício')`, [S])
  await asUser(db, U.hs); await db.query(`select set_commercial_archive('school',$1,true,'Encerrada')`, [S])
  await db.query(`select set_commercial_archive('school',$1,false,'Retomar')`, [S])
  expect((await db.query(`select id from school_contacts where school_id=$1`, [S])).rows).toHaveLength(1)
  await root(); await expect(db.query(`delete from schools where id=$1`, [S])).rejects.toThrow(/física proibida/)
})
it("company meeting saves and queues only its CRM responsible, without a contact or SMTP connection", async () => {
  await meeting()
  const jobs = (await db.query<any>(`select payload,event_sequence from calendar_invite_jobs`)).rows
  expect(jobs).toHaveLength(1)
  expect(jobs[0].payload.recipient.email).toBe("b2b@example.invalid")
  expect(jobs[0].payload.attendees).toHaveLength(1)
  expect((await db.query(`select status,sync_status from activities`)).rows).toEqual([{ status: "agendada", sync_status: "pending" }])
})
it("reschedule and cancel preserve UID, increment sequence, persist even with failed delivery", async () => {
  const id = crypto.randomUUID(); await meeting(id)
  const uid = (await db.query<any>(`select calendar_uid from activities where id=$1`, [id])).rows[0].calendar_uid
  await db.exec(`update calendar_invite_jobs set status='failed';update activities set sync_status='failed'`)
  await meeting(id, 1, "update", meetingPayload("2098-11-03T14:00:00Z", "2098-11-03T15:00:00Z"))
  expect((await db.query<any>(`select calendar_uid,revision,start_at from activities where id=$1`, [id])).rows[0]).toMatchObject({ calendar_uid: uid, revision: 2 })
  await meeting(id, 2, "cancel", {})
  const jobs = (await db.query<any>(`select operation,event_sequence,payload from calendar_invite_jobs order by event_sequence`)).rows
  expect(jobs.map(x => [x.operation, x.event_sequence])).toEqual([["REQUEST", 1], ["REQUEST", 2], ["CANCEL", 3]])
  expect(jobs.every(x => x.payload.event_uid === uid)).toBe(true)
  expect((await db.query(`select status from activities where id=$1`, [id])).rows).toEqual([{ status: "cancelada" }])
})
it("queue claims are server-only, exclusive per source and recover interrupted leases", async () => {
  await meeting(); await asUser(db, U.b2b)
  await expect(db.exec(`select claim_calendar_email_jobs()`)).rejects.toThrow(/permission/)
  await root()
  const first = (await db.query<any>(`select * from claim_calendar_email_jobs()`)).rows
  expect(first).toHaveLength(1); expect(first[0].lease_token).toBeTruthy()
  expect((await db.query(`select * from claim_calendar_email_jobs()`)).rows).toHaveLength(0)
  await db.exec(`alter table calendar_invite_jobs disable trigger user;update calendar_invite_jobs set updated_at=now()-interval '11 minutes';alter table calendar_invite_jobs enable trigger user`)
  const recovered = (await db.query<any>(`select * from claim_calendar_email_jobs()`)).rows
  expect(recovered).toHaveLength(1); expect(recovered[0].lease_token).not.toBe(first[0].lease_token)
})
it("external commitments conflict across modules; internal tasks and adjacent intervals are allowed", async () => {
  await meeting()
  await asUser(db, U.b2b)
  await expect(db.query(`update companies set proxima_acao='Visita',data_proxima_acao='2098-11-03',next_action_owner_id=$2,next_action_start_time='09:30',next_action_end_time='10:30',next_action_kind='external' where id=$1`, [C, U.b2b])).rejects.toThrow(/exclusion/)
  await db.query(`update companies set proxima_acao='Follow-up interno',data_proxima_acao='2098-11-03',next_action_owner_id=$2,next_action_start_time='09:30',next_action_end_time='10:30',next_action_kind='internal' where id=$1`, [C, U.b2b])
  await expect(db.query(`update companies set next_action_kind='external' where id=$1`, [C])).rejects.toThrow(/exclusion/)
  await db.query(`update companies set next_action_start_time='10:00',next_action_end_time='11:00',next_action_kind='external' where id=$1`, [C])
  expect((await db.query(`select proxima_acao from companies where id=$1`, [C])).rows).toHaveLength(1)
})
it("a date-only follow-up produces one all-day event; edit retains UID and cancellation is queued", async () => {
  await asUser(db, U.b2b)
  await db.query(`update companies set proxima_acao='Retornar',data_proxima_acao='2098-11-03',next_action_owner_id=$2 where id=$1`, [C, U.b2b])
  const first = (await db.query<any>(`select event_uid,all_day,sequence from calendar_events`)).rows[0]
  expect(first.all_day).toBe(true)
  await db.query(`update companies set data_proxima_acao='2098-11-04' where id=$1`, [C])
  const after = (await db.query<any>(`select event_uid,all_day,sequence from calendar_events`)).rows[0]
  expect(after.event_uid).toBe(first.event_uid); expect(after.sequence).toBeGreaterThan(first.sequence)
  await db.query(`update companies set proxima_acao=null where id=$1`, [C])
  expect((await db.query(`select operation from calendar_invite_jobs order by created_at desc,id desc limit 1`)).rows[0]).toEqual({ operation: "CANCEL" })
})
it("manual agenda appointments queue REQUEST, update and CANCEL atomically without publishing a schedule cycle", async () => {
  await asUser(db, U.gerente)
  const id = crypto.randomUUID()
  await db.query(`insert into attendance_occurrences(id,user_id,activity,occurrence_date,start_time,end_time,status,created_by) values($1,$2,'conversion','2098-11-03','09:00','10:00','published',$3)`, [id, U.b2b, U.gerente])
  const first = (await db.query<any>(`select event_uid,sequence from calendar_events where source_id=$1`, [id])).rows[0]
  expect(first).toBeTruthy()
  await db.query(`update attendance_occurrences set start_time='10:00',end_time='11:00' where id=$1`, [id])
  expect((await db.query<any>(`select event_uid,sequence from calendar_events where source_id=$1`, [id])).rows[0]).toEqual({ event_uid: first.event_uid, sequence: first.sequence + 1 })
  await db.query(`update attendance_occurrences set status='cancelled' where id=$1`, [id])
  expect((await db.query(`select operation from calendar_invite_jobs where calendar_event_id in(select id from calendar_events where source_id=$1) and operation='CANCEL'`, [id])).rows).toHaveLength(1)
  expect((await db.query(`select id from attendance_cycles`)).rows).toHaveLength(0)
})
