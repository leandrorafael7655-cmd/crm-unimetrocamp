import { readFileSync } from "node:fs"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { type PGlite } from "@electric-sql/pglite"
import { createAuditedDatabase, asUser, TEST_USERS as U } from "@/lib/testing/audited-database"

const C = "20000000-0000-4000-8000-000000000001", S = "20000000-0000-4000-8000-000000000002"
const CC = "30000000-0000-4000-8000-000000000001", CC2 = "30000000-0000-4000-8000-000000000002", SC = "30000000-0000-4000-8000-000000000003"
const M = "40000000-0000-4000-8000-000000000001"
const migration = readFileSync(new URL("../../supabase/migrations/20261029235301_contact_meeting_invitations.sql", import.meta.url), "utf8")
let db: PGlite
async function root() { await db.exec("reset role; select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','',false),set_config('request.jwt.claims','{}',false)") }
const data = (start = "2098-11-03T13:00:00Z") => ({ subject: "Parceria", description: "Pauta fictícia", mode: "online", meeting_url: "https://teams.microsoft.com/test", location: "", start_at: start, end_at: start.replace(":00:00Z", ":15:00Z") })
async function save(op = "create", revision = 0, contacts = [CC, CC2], entity = "company", payload = data(), actor = U.b2b, id = M) {
  return db.query("select save_contact_meeting($1,$2,$3,$4,$5,$6,$7,$8,'agenda@example.invalid')", [actor, id, revision, entity, entity === "company" ? C : S, op, JSON.stringify(payload), contacts])
}
const claim = (meeting: string | null = M, testEmail: string | null = null) => db.query<{ id: string; recipient_email: string; payload: any }>("select * from claim_contact_meeting_job($1,$2,$3,'agenda@example.invalid')", [meeting, U.b2b, testEmail])
beforeAll(async () => {
  db = await createAuditedDatabase()
  const claimBefore = (await db.query("select pg_get_functiondef('claim_calendar_email_jobs(integer,uuid,uuid)'::regprocedure) definition")).rows
  await db.exec(migration)
  expect((await db.query("select pg_get_functiondef('claim_calendar_email_jobs(integer,uuid,uuid)'::regprocedure) definition")).rows).toEqual(claimBefore)
}, 60000)
afterAll(async () => { await db?.close() })
beforeEach(async () => {
  await root()
  await db.exec("drop trigger if exists fail_contact_job on contact_meeting_jobs")
  await db.exec(`truncate private.external_calendar_reservations,contact_meeting_jobs,contact_meeting_recipients,contact_meetings,companies,schools,calendar_invite_jobs,calendar_events cascade;
    update profiles set active=true,must_change_password=false,password_reset_pending=false;
    insert into companies(id,razao_social,owner_id) values('${C}','Empresa fictícia','${U.b2b}');
    insert into schools(id,name) values('${S}','Escola fictícia');
    insert into company_contacts(id,company_id,nome,email) values('${CC}','${C}','Contato A','b2b@example.invalid'),('${CC2}','${C}','Contato B','B2B@example.invalid');
    insert into school_contacts(id,school_id,name,email) values('${SC}','${S}','Direção fictícia','b2b@example.invalid');`)
})
describe("Contact invitations against full audited PostgreSQL + all 12 migrations", () => {
  it.each(["company", "school"])("%s snapshots each selected person, deduplicates email and creates one source row without legacy jobs", async entity => {
    await save("create", 0, entity === "company" ? [CC, CC2] : [SC], entity)
    expect((await db.query("select * from contact_meeting_recipients")).rows).toHaveLength(entity === "company" ? 3 : 2)
    expect((await db.query("select * from contact_meeting_jobs")).rows).toHaveLength(1)
    expect((await db.query("select * from calendar_invite_jobs")).rows).toHaveLength(0)
    expect((await db.query(`select id,contact_meeting_id from ${entity === "company" ? "activities" : "school_actions"}`)).rows).toEqual([{ id: M, contact_meeting_id: M }])
    expect((await claim()).rows).toHaveLength(0)
  })
  it("allows no contacts, preserves original addresses across edits, increments sequence and keeps UID through cancellation", async () => {
    await save("create", 0, [])
    const before = (await db.query<{ event_uid: string }>("select event_uid from contact_meetings")).rows[0]
    await db.exec("update profiles set email='changed@example.invalid' where id='" + U.b2b + "'")
    await save("update", 1, [], "company", data("2098-11-03T14:00:00Z"))
    await save("cancel", 2, [])
    expect((await db.query("select event_uid,revision,status from contact_meetings")).rows[0]).toEqual({ ...before, revision: 3, status: "cancelada" })
    expect((await db.query("select recipient_email,event_sequence,operation,status from contact_meeting_jobs order by event_sequence")).rows).toEqual([
      { recipient_email: "b2b@example.invalid", event_sequence: 0, operation: "REQUEST", status: "superseded" },
      { recipient_email: "b2b@example.invalid", event_sequence: 1, operation: "REQUEST", status: "superseded" },
      { recipient_email: "b2b@example.invalid", event_sequence: 2, operation: "CANCEL", status: "pending" },
    ])
    await db.exec("update profiles set email='b2b@example.invalid' where id='" + U.b2b + "'")
  })
  it("rejects foreign contacts and missing email atomically, for company and school", async () => {
    await expect(save("create", 0, [SC])).rejects.toThrow(/Contato não pertence/)
    await expect(save("create", 0, [CC], "school")).rejects.toThrow(/Contato não pertence/)
    await db.exec(`update company_contacts set email=null where id='${CC}'`)
    await expect(save("create", 0, [CC])).rejects.toThrow()
    expect((await db.query("select * from contact_meetings")).rows).toHaveLength(0)
    expect((await db.query("select * from activities")).rows).toHaveLength(0)
  })
  it("cannot swap recipient IDs on reschedule; rejects wrong actor, stale revision and duplicate create", async () => {
    await save()
    await expect(save("update", 1, [CC])).rejects.toThrow(/destinatários/)
    await expect(save("update", 1, [CC, CC2], "company", data(), U.outro)).rejects.toThrow(/carteira|responsável/)
    await expect(save("update", 3)).rejects.toThrow(/alterada/)
    await expect(save()).rejects.toThrow(/já registrada/)
    expect((await db.query("select count(*)::int n from contact_meeting_jobs")).rows[0]).toEqual({ n: 1 })
  })
  it("service_role can execute the named RPC with the explicit grants; a queue error rolls back source and recipients", async () => {
    await asUser(db, U.b2b, "service_role")
    await save()
    await root()
    await db.exec(`create function private.fail_contact_job() returns trigger language plpgsql as $$begin raise exception 'falha controlada no job';end$$;
      create trigger fail_contact_job before insert on contact_meeting_jobs for each row execute function private.fail_contact_job();`)
    const next = "40000000-0000-4000-8000-000000000002"
    await expect(save("create", 0, [], "school", data("2098-11-03T15:00:00Z"), U.b2b, next)).rejects.toThrow(/falha controlada/)
    expect((await db.query("select id from contact_meetings where id=$1", [next])).rows).toHaveLength(0)
    expect((await db.query("select id from school_actions where id=$1", [next])).rows).toHaveLength(0)
    expect((await db.query("select id from contact_meeting_recipients where meeting_id=$1", [next])).rows).toHaveLength(0)
  })
  it("claims each distinct address once and never reclaims successful deliveries after a partial failure", async () => {
    await db.exec(`update company_contacts set email='external@example.invalid' where id='${CC2}'`)
    await save()
    await db.exec(`update contact_meetings set delivery_enabled=true where id='${M}'`)
    const first = (await claim()).rows[0]
    await db.query("update contact_meeting_jobs set status='sent_provider',lease_token=null,sent_at=now() where id=$1", [first.id])
    const second = (await claim()).rows[0]
    expect(second.recipient_email).not.toBe(first.recipient_email)
    await db.query("update contact_meeting_jobs set status='failed',lease_token=null,next_attempt_at=now()+interval '1 hour' where id=$1", [second.id])
    expect((await claim(null)).rows).toHaveLength(0)
    expect((await claim()).rows[0].id).toBe(second.id)
  })
  it("lists and reactivates an archived company through the actual RPC while preserving its history and other rows", async () => {
    await asUser(db, U.gerente)
    await db.query("select set_commercial_archive('company',$1,true,'Teste de arquivamento')", [C])
    expect((await db.query("select id from companies where archived_at is not null")).rows).toEqual([{ id: C }])
    expect((await db.query("select id from company_contacts where company_id=$1", [C])).rows).toHaveLength(2)
    await db.query("select set_commercial_archive('company',$1,false,'Teste de reativação')", [C])
    expect((await db.query("select id from companies where archived_at is not null")).rows).toHaveLength(0)
    expect((await db.query("select id from companies where archived_at is null")).rows).toEqual([{ id: C }])
    expect((await db.query<{ archived: boolean }>("select archived from commercial_archive_history where entity_type='company' and entity_id=$1 order by changed_at,id", [C])).rows.map(r => r.archived).sort()).toEqual([false, true])
    expect((await db.query("select id from company_contacts where company_id=$1", [C])).rows).toHaveLength(2)
  })
  it("requires both per-meeting approval and exact acceptance email, leases one send, blocks edits until finished", async () => {
    await save()
    expect((await claim()).rows).toHaveLength(0)
    await db.exec(`update contact_meetings set delivery_enabled=true where id='${M}'`)
    expect((await claim(M, "different@example.invalid")).rows).toHaveLength(0)
    const job = (await claim(M, "b2b@example.invalid")).rows[0]
    expect(job.recipient_email).toBe("b2b@example.invalid")
    expect(job.payload.attendees).toHaveLength(1)
    expect((await claim()).rows).toHaveLength(0)
    await expect(save("cancel", 1)).rejects.toThrow(/processamento/)
    await db.query("update contact_meeting_jobs set status='sent_provider',lease_token=null,sent_at=now() where id=$1", [job.id])
    await save("cancel", 1)
    expect((await claim()).rows[0].payload.event_uid).toBe(job.payload.event_uid)
  })
  it("a stale lease becomes delivery_unknown and cannot be automatically sent or superseded", async () => {
    await save()
    await db.exec(`update contact_meetings set delivery_enabled=true where id='${M}'`)
    const job = (await claim()).rows[0]
    await db.query("update contact_meeting_jobs set updated_at=now()-interval '11 minutes' where id=$1", [job.id])
    expect((await claim()).rows).toHaveLength(0)
    expect((await db.query("select status,lease_token from contact_meeting_jobs")).rows).toEqual([{ status: "delivery_unknown", lease_token: null }])
    await expect(save("cancel", 1)).rejects.toThrow(/sem confirmação/)
  })
  it("has explicit SELECT/EXECUTE grants, RLS and no browser writes/RPC execution or legacy-source edits", async () => {
    await save("create", 0, [SC], "school")
    await asUser(db, U.b2b)
    expect((await db.query("select id from contact_meetings")).rows).toHaveLength(1)
    await expect(save("cancel", 1, [], "school")).rejects.toThrow(/permission denied/)
    await expect(db.exec(`update contact_meetings set delivery_enabled=true`)).rejects.toThrow(/permission denied/)
    await root()
    await expect(db.exec(`update school_actions set status='cancelada' where id='${M}'`)).rejects.toThrow(/painel Reuniões/)
    await asUser(db, U.outro)
    expect((await db.query("select id from contact_meetings")).rows).toHaveLength(0)
    expect((await db.query("select id from contact_meeting_jobs")).rows).toHaveLength(0)
    await root()
    expect((await db.query("select has_function_privilege('service_role','public.save_contact_meeting(uuid,uuid,integer,text,uuid,text,jsonb,uuid[],text)','execute') ok")).rows[0]).toEqual({ ok: true })
    await db.exec("set role anon")
    await expect(db.exec("select * from contact_meeting_jobs")).rejects.toThrow(/permission denied/)
  })
})
