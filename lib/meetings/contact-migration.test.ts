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
async function service() { await root(); await db.exec(`select set_config('request.jwt.claim.role','service_role',false),set_config('request.jwt.claims','{"role":"service_role"}',false);set role service_role`) }
const data = (start = "2098-11-03T13:00:00Z") => ({ subject: "Parceria", description: "Pauta fictícia", mode: "online", meeting_url: "https://teams.microsoft.com/test", location: "", start_at: start, end_at: start.replace(":00:00Z", ":15:00Z") })
async function save(op = "create", revision = 0, contacts = [CC, CC2], entity = "company", payload: Record<string, unknown> = data(), actor: string = U.b2b, id = M) {
  return db.query("select save_contact_meeting($1,$2,$3,$4,$5,$6,$7,$8,'agenda@example.invalid')", [actor, id, revision, entity, entity === "company" ? C : S, op, JSON.stringify(payload), contacts])
}
const claim = (meeting: string | null = M, testEmail: string | null = null, exclude: string[] = []) => db.query<{ id: string; recipient_email: string; payload: any }>("select * from claim_contact_meeting_job($1,$2,$3,'agenda@example.invalid',$4)", [meeting, U.b2b, testEmail, exclude])
async function queueSnapshot() {
  return (await db.query(`select * from (select 'new' as queue,to_jsonb(j) as row from contact_meeting_jobs j
    union all select 'legacy',to_jsonb(j) from calendar_invite_jobs j) snapshots order by queue,row->>'id'`)).rows
}
// Simulate time having elapsed; only synthetic fixtures in the isolated database are changed.
async function elapse(entity: string) {
  await db.exec(`begin; select set_config('uniconecta.contact_meeting_write','${M}',true);
    update contact_meetings set start_at=date_trunc('day',now())-interval '12 hours',end_at=date_trunc('day',now())-interval '11 hours' where id='${M}';
    ${entity === "company" ? `update activities set data=(now() at time zone 'America/Sao_Paulo')::date-1,start_at=date_trunc('day',now())-interval '12 hours',end_at=date_trunc('day',now())-interval '11 hours' where id='${M}';`
      : `update school_actions set action_date=(now() at time zone 'America/Sao_Paulo')::date-1,start_time='09:00',end_time='10:00' where id='${M}';`}
    commit;`)
}
async function businessSnapshot(entity: string) {
  if (entity === "company") return {
    source: (await db.query(`select status,conta_meta_semanal,primary_owner_id,data,tipo from activities where id=$1`, [M])).rows,
    company: (await db.query(`select etapa,ultimo_contato,relationship_status from companies where id=$1`, [C])).rows,
    portfolio: (await db.query(`select effective_relationship,has_action_current_cycle,relationship_health,at_risk,last_action_date from b2b_company_portfolio where id=$1`, [C])).rows,
    weekly: (await db.query(`select count(*)::int completed,count(distinct company_id)::int companies from activities
      where primary_owner_id=$1 and status='realizada' and conta_meta_semanal and company_id is not null
      and data between (now() at time zone 'America/Sao_Paulo')::date-7 and (now() at time zone 'America/Sao_Paulo')::date`, [U.b2b])).rows,
    monthly: (await db.query(`select count(*)::int completed from activities where status='realizada' and data>=date_trunc('month',now() at time zone 'America/Sao_Paulo')::date`)).rows,
    history: (await db.query(`select kind,previous_value,new_value,reason from company_portfolio_history where company_id=$1 order by created_at,kind`, [C])).rows,
  }
  return {
    source: (await db.query(`select status,primary_owner_id,action_date,supervest_cycle_id from school_actions where id=$1`, [M])).rows,
    school: (await db.query(`select relationship_stage,last_action_at from schools where id=$1`, [S])).rows,
    goals: (await db.query(`select count(*)::int completed from school_actions where status='realizada' and primary_owner_id=$1
      and action_date between (now() at time zone 'America/Sao_Paulo')::date-7 and (now() at time zone 'America/Sao_Paulo')::date`, [U.b2b])).rows,
    results: (await db.query(`select * from school_action_grade_results where school_action_id=$1`, [M])).rows,
  }
}
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
  await db.exec("drop trigger if exists fail_contact_result on contact_meetings")
  await db.exec(`truncate private.external_calendar_reservations,contact_meeting_jobs,contact_meeting_recipients,contact_meetings,companies,schools,supervest_cycles,calendar_invite_jobs,calendar_events,commercial_archive_history cascade;
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
    if(entity === "school") expect((await db.query("select supervest_cycle_id from school_actions")).rows).toEqual([{supervest_cycle_id:null}])
  })
  it.each(["company", "school"])("%s allows no contacts, preserves original addresses across edits, increments sequence and keeps UID through cancellation", async entity => {
    await save("create", 0, [], entity)
    const before = (await db.query<{ event_uid: string }>("select event_uid from contact_meetings")).rows[0]
    await db.exec("update profiles set email='changed@example.invalid' where id='" + U.b2b + "'")
    await save("update", 1, [], entity, data("2098-11-03T14:00:00Z"))
    await save("cancel", 2, [], entity)
    expect((await db.query("select id from calendar_invite_jobs")).rows).toHaveLength(0)
    expect((await db.query(`select status from ${entity === "company" ? "activities" : "school_actions"}`)).rows).toEqual([{status:"cancelada"}])
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
  it("preserves a presencial address alongside an optional Teams URL in the queued invitation", async () => {
    await save("create", 0, [], "school", { ...data(), mode: "presencial", location: "Sala presencial fictícia" })
    const payload = (await db.query<{ payload: any }>("select payload from contact_meeting_jobs")).rows[0].payload
    expect(payload.location).toBe("Sala presencial fictícia")
    expect(payload.meeting_url).toBe("https://teams.microsoft.com/test")
    expect((await db.query("select location from school_actions")).rows).toEqual([{ location: "Sala presencial fictícia" }])
  })
  it("operational support moving between legacy/new school actions never creates a legacy invitation for a new meeting", async () => {
    await save("create", 0, [], "school")
    const legacy = "40000000-0000-4000-8000-000000000009"
    await db.query("insert into school_actions(id,school_id,action_date,start_time,end_time,action_type,status,primary_owner_id) values($1,$2,'2098-11-03','15:00','16:00','Visita de relacionamento','agendada',$3)", [legacy, S, U.hs])
    await db.query("insert into school_action_participants(school_action_id,user_id,role_in_action) values($1,$2,'Apoio')", [M, U.outro])
    await db.query("update school_action_participants set school_action_id=$1 where school_action_id=$2 and user_id=$3", [legacy, M, U.outro])
    expect((await db.query("select id from calendar_events where source_id=$1", [M])).rows).toHaveLength(0)
    await db.query("update school_action_participants set school_action_id=$1 where school_action_id=$2 and user_id=$3", [M, legacy, U.outro])
    expect((await db.query("select id from calendar_events where source_id=$1", [M])).rows).toHaveLength(0)
    expect((await db.query("select status from calendar_events where source_id=$1 and recipient_user_id=$2", [legacy, U.outro])).rows).toEqual([{status:"cancelled"}])
    expect((await db.query("select recipient_email from contact_meeting_jobs")).rows).toEqual([{recipient_email:"b2b@example.invalid"}])
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
    expect((await claim(M, "b2b@example.invalid")).rows).toHaveLength(0)
    const first = (await claim()).rows[0]
    await db.query("update contact_meeting_jobs set status='sent_provider',lease_token=null,sent_at=now() where id=$1", [first.id])
    const second = (await claim()).rows[0]
    expect(second.recipient_email).not.toBe(first.recipient_email)
    await db.query("update contact_meeting_jobs set status='failed',lease_token=null,next_attempt_at=now()+interval '1 hour' where id=$1", [second.id])
    expect((await claim(null)).rows).toHaveLength(0)
    expect((await claim(M, null, [second.id])).rows).toHaveLength(0)
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
  it.each(["company", "school"])("%s records confirmation without mail, calendar revision or recipient changes; edit version rejects stale forms", async entity => {
    await save("create", 0, [], entity)
    const jobs = await queueSnapshot()
    const recipients = (await db.query("select * from contact_meeting_recipients")).rows
    const uid = (await db.query<{event_uid:string}>("select event_uid from contact_meetings")).rows[0]
    await service()
    await save("result", 1, [], entity, { status: "confirmada" })
    expect((await db.query("select status,revision,write_version,event_uid,result_recorded_by,result_recorded_at is not null recorded from contact_meetings")).rows).toEqual([
      { status: "confirmada", revision: 1, write_version: 2, ...uid, result_recorded_by: U.b2b, recorded: true },
    ])
    expect((await db.query(`select status from ${entity === "company" ? "activities" : "school_actions"} where id=$1`, [M])).rows).toEqual([{ status: "confirmada" }])
    expect(await queueSnapshot()).toEqual(jobs)
    expect((await db.query("select * from contact_meeting_recipients")).rows).toEqual(recipients)
    await expect(save("update", 1, [], entity)).rejects.toThrow(/alterada/)
    await expect(save("result", 1, [], entity, { status: "realizada" })).rejects.toThrow(/alterada/)
    await expect(save("result", 2, [], entity, { status: "realizada" })).rejects.toThrow(/após o início/)
    await save("update", 2, [], entity, data("2098-11-03T14:00:00Z"))
    await save("cancel", 3, [], entity)
    expect((await db.query("select revision,write_version,status from contact_meetings")).rows).toEqual([{revision:3,write_version:4,status:"cancelada"}])
    expect((await db.query("select event_sequence,operation from contact_meeting_jobs order by event_sequence")).rows).toEqual([
      {event_sequence:0,operation:"REQUEST"},{event_sequence:1,operation:"REQUEST"},{event_sequence:2,operation:"CANCEL"},
    ])
    await expect(save("result", 4, [], entity, {status:"confirmada"})).rejects.toThrow(/cancelada/)
  })
  it.each(["company", "school"].flatMap(entity => ["confirmada", "realizada", "nao_compareceu"].map(status => ({entity,status}))))(
    "$entity $status has the same business effects as the native legacy source update, with unchanged outboxes", async ({entity,status}) => {
      await save("create", 0, [], entity)
      await elapse(entity)
      const jobs = await queueSnapshot()
      // Reference: exact legacy status update / atomic school RPC, on the same synthetic source.
      // A test-only local gate permits this reference; the savepoint rolls every effect back.
      await db.exec(`begin; savepoint legacy_reference; select set_config('uniconecta.contact_meeting_write','${M}',true);`)
      if (entity === "company") {
        await db.query("update activities set status=$1,revision=revision+1,conta_meta_semanal=($1='realizada'),updated_at=now() where id=$2", [status, M])
      } else {
        const action = (await db.query<{ row: object }>("select to_jsonb(a) as row from school_actions a where id=$1", [M])).rows[0].row
        await asUser(db, U.hs)
        await db.query("select save_school_action_atomic($1,$2,'[]','[]')", [M, JSON.stringify({...action,status})])
        await root()
      }
      const reference = await businessSnapshot(entity)
      await db.exec("rollback to savepoint legacy_reference; commit;")
      await root()
      await save("result", 1, [], entity, {status})
      const current = await businessSnapshot(entity)
      expect(current).toEqual(reference)
      expect(await queueSnapshot()).toEqual(jobs)
      expect((await db.query("select revision,write_version from contact_meetings")).rows).toEqual([{revision:1,write_version:2}])
      if (entity === "company") expect(current.weekly).toEqual([{completed:status==='realizada'?1:0,companies:status==='realizada'?1:0}])
      else expect(current.goals).toEqual([{completed:status==='realizada'?1:0}])
      await expect(db.exec(`update ${entity==='company'?'activities':'school_actions'} set status='cancelada' where id='${M}'`)).rejects.toThrow(/painel Reuniões/)
    })
  it.each(["company", "school"])("%s archives/reactivates with a linked new meeting, preserving IDs, snapshots, jobs and source", async entity => {
    await save("create", 0, [], entity)
    const before = (await db.query(`select to_jsonb(m) row from contact_meetings m
      union all select to_jsonb(s) from ${entity==='company'?'activities':'school_actions'} s where id='${M}'`)).rows
    const jobs = await queueSnapshot()
    const recipients = (await db.query("select * from contact_meeting_recipients order by id")).rows
    await asUser(db, U.gerente)
    await db.query("select set_commercial_archive($1,$2,true,'Teste com reunião vinculada')", [entity,entity==='company'?C:S])
    expect((await db.query(`select archived_at is not null archived from ${entity==='company'?'companies':'schools'} where id=$1`,[entity==='company'?C:S])).rows).toEqual([{archived:true}])
    await db.query("select set_commercial_archive($1,$2,false,'Reativação com reunião vinculada')", [entity,entity==='company'?C:S])
    expect((await db.query(`select to_jsonb(m) row from contact_meetings m
      union all select to_jsonb(s) from ${entity==='company'?'activities':'school_actions'} s where id='${M}'`)).rows).toEqual(before)
    expect(await queueSnapshot()).toEqual(jobs)
    expect((await db.query("select * from contact_meeting_recipients order by id")).rows).toEqual(recipients)
    expect((await db.query<{archived:boolean}>("select archived from commercial_archive_history where entity_type=$1 and entity_id=$2 order by changed_at,id",[entity,entity==='company'?C:S])).rows.map(r=>r.archived).sort()).toEqual([false,true])
  })
  it.each(["company", "school"])("%s result is atomic and restores the source gate when an error happens after updating business data", async entity => {
    await save("create",0,[],entity)
    await elapse(entity)
    const before=await businessSnapshot(entity), jobs=await queueSnapshot()
    await db.exec(`create or replace function private.fail_contact_result() returns trigger language plpgsql as $$begin raise exception 'falha controlada no resultado';end$$;
      create trigger fail_contact_result before update on contact_meetings for each row execute function private.fail_contact_result();`)
    await expect(save("result",1,[],entity,{status:"realizada"})).rejects.toThrow(/falha controlada no resultado/)
    expect(await businessSnapshot(entity)).toEqual(before)
    expect(await queueSnapshot()).toEqual(jobs)
    expect((await db.query("select status,write_version from contact_meetings")).rows).toEqual([{status:"agendada",write_version:1}])
    await expect(db.exec(`update ${entity==='company'?'activities':'school_actions'} set status='realizada' where id='${M}'`)).rejects.toThrow(/painel Reuniões/)
  })
  it.each(["company", "school"])("%s allows correcting a recorded outcome without duplicating indicators or changing the invitation", async entity => {
    await save("create",0,[],entity)
    await elapse(entity)
    const jobs=await queueSnapshot()
    await save("result",1,[],entity,{status:"realizada"})
    await save("result",2,[],entity,{status:"realizada"})
    await save("result",3,[],entity,{status:"nao_compareceu"})
    const current=await businessSnapshot(entity)
    expect(entity==='company'?current.weekly:current.goals).toEqual(entity==='company'?[{completed:0,companies:0}]:[{completed:0}])
    expect(await queueSnapshot()).toEqual(jobs)
    expect((await db.query("select status,revision,write_version from contact_meetings")).rows).toEqual([{status:"nao_compareceu",revision:1,write_version:4}])
    await expect(save("update",4,[],entity)).rejects.toThrow(/encerrada/)
    await expect(save("cancel",4,[],entity)).rejects.toThrow(/encerrada/)
  })
  it("transfers a company through the real portfolio RPC without changing the original meeting responsible or recipients", async () => {
    await save("create",0,[])
    const jobs=await queueSnapshot()
    await asUser(db,U.gerente)
    await db.query("select b2b_portfolio_command('transfer',$1)",[JSON.stringify({assignments:[{companyId:C,expectedOwnerId:U.b2b,newOwnerId:U.outro}],reason:"Redistribuição"})])
    expect((await db.query("select owner_id from companies where id=$1",[C])).rows).toEqual([{owner_id:U.outro}])
    expect((await db.query("select responsible_user_id from contact_meetings")).rows).toEqual([{responsible_user_id:U.b2b}])
    expect((await db.query("select primary_owner_id,organizer_user_id from activities where id=$1",[M])).rows).toEqual([{primary_owner_id:U.b2b,organizer_user_id:U.b2b}])
    expect((await db.query("select email from contact_meeting_recipients")).rows).toEqual([{email:"b2b@example.invalid"}])
    expect(await queueSnapshot()).toEqual(jobs)
    await service()
    await save("result",1,[],"company",{status:"confirmada"})
    expect(await queueSnapshot()).toEqual(jobs)
    await expect(save("result",2,[],"company",{status:"confirmada"},U.outro)).rejects.toThrow(/responsável/)
  })
  it("changes the school's reference owner and the active SuperVest edition with a new linked meeting, without moving its source or sending mail", async () => {
    await save("create",0,[],"school")
    const jobs=await queueSnapshot()
    await db.exec(`insert into supervest_cycles(id,name,is_active) values('50000000-0000-4000-8000-000000000001','Edição A',true),('50000000-0000-4000-8000-000000000002','Edição B',false);`)
    await asUser(db,U.gerente)
    await db.query("update schools set primary_owner_id=$1 where id=$2",[U.hs,S])
    await db.query("update schools set primary_owner_id=$1 where id=$2",[U.outro,S])
    await db.query("select configure_school_capture_cycle('50000000-0000-4000-8000-000000000002',2099,'2098-10-01','2099-04-30',true)")
    expect((await db.query("select primary_owner_id from schools where id=$1",[S])).rows).toEqual([{primary_owner_id:U.outro}])
    expect((await db.query<{new_owner_id:string}>("select new_owner_id from school_owner_history where school_id=$1 order by changed_at,id",[S])).rows.map(r=>r.new_owner_id).sort()).toEqual([U.hs,U.outro].sort())
    expect((await db.query("select id from supervest_cycles where is_active")).rows).toEqual([{id:"50000000-0000-4000-8000-000000000002"}])
    expect((await db.query("select contact_meeting_id,primary_owner_id,supervest_cycle_id from school_actions where id=$1",[M])).rows).toEqual([{contact_meeting_id:M,primary_owner_id:U.b2b,supervest_cycle_id:null}])
    expect((await db.query("select responsible_user_id from contact_meetings")).rows).toEqual([{responsible_user_id:U.b2b}])
    expect(await queueSnapshot()).toEqual(jobs)
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
