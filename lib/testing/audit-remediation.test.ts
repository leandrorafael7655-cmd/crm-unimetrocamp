import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest"
import { type PGlite } from "@electric-sql/pglite"
import { createAuditedDatabase, asUser, TEST_USERS as U } from "./audited-database"

const C='20000000-0000-4000-8000-000000000001', S='20000000-0000-4000-8000-000000000002'
let db:PGlite
async function root() {await db.exec(`reset role;select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','',false),set_config('request.jwt.claims','{}',false);`)}
const plan=(date='2098-11-03')=>({route_name:'Rota fictícia',plan_date:date,avg_visit_minutes:45,status:'rascunho'})
const stops=[{entity_type:'company',entity_id:C,sort_order:0,visit_minutes:30}]
const action=(date='2098-11-03')=>({school_id:S,action_date:date,start_time:'09:00',end_time:'10:00',action_type:'Visita de relacionamento',status:'agendada',primary_owner_id:U.hs})
async function saveAction(id:string|null=null,a=action(),parts=[{user_id:U.b2b,role_in_action:'Apoio'}],results:unknown[]=[]) {
  return (await db.query<{id:string}>(`select public.save_school_action_atomic($1,$2,$3,$4) id`,[id,JSON.stringify(a),JSON.stringify(parts),JSON.stringify(results)])).rows[0].id
}
async function saveRoute(id:string|null=null,p=plan(),items=stops) {
  return (await db.query<{id:string}>(`select public.save_route_plan_atomic($1,$2,$3) id`,[id,JSON.stringify(p),JSON.stringify(items)])).rows[0].id
}
async function state(table:string) {await root();return (await db.query(`select * from ${table} order by 1`)).rows}
async function failOn(table:string) {
  await root();await db.exec(`create or replace function private.audit_fail() returns trigger language plpgsql as $$begin raise exception 'falha controlada';end$$;create trigger audit_fault before insert or update on public.${table} for each row execute function private.audit_fail();`)
}
beforeAll(async()=>{db=await createAuditedDatabase()},60000)
afterAll(async()=>{await db?.close()})
beforeEach(async()=>{
  await root()
  await db.exec(`drop trigger if exists audit_fault on school_action_participants;drop trigger if exists audit_fault on school_action_grade_results;drop trigger if exists audit_fault on route_stops;drop trigger if exists audit_fault on company_contacts;
    truncate schools,companies,route_plans,calendar_events,calendar_invite_jobs,attendance_cycles,attendance_occurrences,goals cascade;
    update profiles set active=true,role='gerente' where id='${U.gerente2}';
    update profiles set active=true,role='gerente' where id='${U.gerente}';
    update profiles set active=true,must_change_password=false,password_reset_pending=false where id in('${U.b2b}','${U.outro}','${U.hs}','${U.supervisor}');
    insert into companies(id,razao_social,owner_id) values('${C}','Empresa fictícia','${U.b2b}');
    insert into schools(id,name,created_by) values('${S}','Escola fictícia','${U.hs}');`)
})
describe('Audit remediation against the complete audited PostgreSQL schema (Auth claims simulated)',()=>{
  it.each(['gerente','supervisor','high_school'])('SEC-01: signup metadata %s cannot activate or grant privileges',async role=>{
    const id=crypto.randomUUID()
    await db.query(`insert into auth.users(id,email,raw_user_meta_data) values($1,'signup@example.invalid',$2)`,[id,JSON.stringify({role,active:true,must_change_password:false})])
    const p=(await db.query(`select role,active from profiles where id=$1`,[id])).rows[0]
    expect(p).toEqual({role:'consultor_b2b',active:false})
    await db.query(`update auth.users set raw_user_meta_data=$2 where id=$1`,[id,JSON.stringify({role:'gerente',active:true})])
    expect((await db.query(`select role,active from profiles where id=$1`,[id])).rows[0]).toEqual(p)
  })
  it('SEC-01: browser cannot change its own role, active state or login email',async()=>{
    await asUser(db,U.b2b)
    for(const assignment of ["role='supervisor'","active=false","email='different@example.invalid'"]) await expect(db.exec(`update profiles set ${assignment} where id='${U.b2b}'`)).rejects.toThrow()
    expect((await state('profiles')).find((p:any)=>p.id===U.b2b)).toMatchObject({role:'consultor_b2b',active:true})
  })
  it('ACCESS-01: service-role caller still cannot remove the last manager by any profile operation',async()=>{
    await db.exec(`update profiles set active=false where id='${U.gerente2}'`)
    for(const sql of [`update profiles set role='consultor_b2b' where id='${U.gerente}'`,`update profiles set active=false where id='${U.gerente}'`,`delete from profiles where id='${U.gerente}'`]) await expect(db.exec(sql)).rejects.toThrow(/último gerente/)
    expect((await db.query(`select active_managers from private.crm_admin_guard`)).rows[0]).toEqual({active_managers:1})
  })
  it('ACCESS-01: Auth soft-delete and ban cannot bypass last-manager protection',async()=>{
    await db.exec(`update profiles set active=false where id='${U.gerente2}'`)
    await expect(db.exec(`update auth.users set deleted_at=now() where id='${U.gerente}'`)).rejects.toThrow(/último gerente/)
    await expect(db.exec(`update auth.users set banned_until=now()+interval '1 day' where id='${U.gerente}'`)).rejects.toThrow(/último gerente/)
  })
  it('ACCESS-01: two queued removals cannot remove both managers (one PostgreSQL session, not a multi-session concurrency test)',async()=>{
    const result=await Promise.allSettled([db.exec(`update profiles set active=false where id='${U.gerente}'`),db.exec(`update profiles set active=false where id='${U.gerente2}'`)])
    expect(result.filter(x=>x.status==='fulfilled')).toHaveLength(1)
    expect((await db.query<{n:number}>(`select count(*) n from profiles where role='gerente' and active`)).rows[0].n).toBe(1)
  })
  it('ACCESS-01: privileged RPC denies supervisor actor and all browser execution',async()=>{
    await expect(db.query(`select admin_update_crm_profile($1,$2,'{"role":"consultor_b2b"}')`,[U.supervisor,U.gerente])).rejects.toThrow(/restrita/)
    await asUser(db,U.gerente)
    await expect(db.query(`select admin_update_crm_profile($1,$2,'{"active":false}')`,[U.gerente,U.outro])).rejects.toThrow(/permission denied/)
  })
  it('SCHOOL-02: participant insert failure preserves date, results, participants and calendar',async()=>{
    await asUser(db,U.hs);const id=await saveAction()
    const before=await state('school_actions'), people=await state('school_action_participants'), events=await state('calendar_events')
    await failOn('school_action_participants');await asUser(db,U.hs)
    await expect(saveAction(id,action('2098-11-04'),[{user_id:U.outro,role_in_action:'Apoio'}])).rejects.toThrow(/falha controlada/)
    expect(await state('school_actions')).toEqual(before);expect(await state('school_action_participants')).toEqual(people);expect(await state('calendar_events')).toEqual(events)
  })
  it('SCHOOL-02: result failure rolls back the entire edit',async()=>{
    await asUser(db,U.hs);const id=await saveAction(null,action(),[],[{grade:'em3',leads:2,supervest_registrations:1}])
    const before=await state('school_actions'), results=await state('school_action_grade_results')
    await failOn('school_action_grade_results');await asUser(db,U.hs)
    await expect(saveAction(id,action('2098-11-04'),[],[{grade:'em3',leads:3,supervest_registrations:1}])).rejects.toThrow()
    expect(await state('school_actions')).toEqual(before);expect(await state('school_action_grade_results')).toEqual(results)
  })
  it('SCHOOL-02/agenda: successful edit retains action/result IDs and recipient UIDs, removes only departed support',async()=>{
    await asUser(db,U.hs);const id=await saveAction(null,action(),[{user_id:U.b2b,role_in_action:'Apoio'}],[{grade:'em3',leads:2}])
    const result=(await state('school_action_grade_results'))[0] as any, before=await state('calendar_events') as any[]
    await asUser(db,U.hs);expect(await saveAction(id,action('2098-11-04'),[{user_id:U.outro,role_in_action:'Apoio'}],[{grade:'em3',leads:4}])).toBe(id)
    expect((await state('school_action_grade_results'))[0]).toMatchObject({id:result.id,leads:4})
    const after=await state('calendar_events') as any[]
    const principal=before.find(e=>e.recipient_user_id===U.hs)
    expect(after.find(e=>e.recipient_user_id===U.hs)).toMatchObject({id:principal.id,event_uid:principal.event_uid,status:'active'})
    expect(after.find(e=>e.recipient_user_id===U.b2b)?.status).toBe('cancelled')
    expect(after.filter(e=>e.status==='active')).toHaveLength(2)
  })
  it.each([['15:00','14:00'],['15:00','15:00'],['09:00',null]])('SCHOOL-01: database rejects invalid or incomplete interval %s/%s',async(start,end)=>{
    await asUser(db,U.hs)
    await expect(saveAction(null,{...action(),start_time:start,end_time:end} as any)).rejects.toThrow()
    expect(await state('school_actions')).toHaveLength(0)
  })
  it('AGENDA-02: principal and support cannot be double-booked; adjacent times and cancellation release work',async()=>{
    await asUser(db,U.hs);const id=await saveAction()
    await expect(saveAction()).rejects.toThrow()
    await expect(saveAction(null,{...action(),primary_owner_id:U.outro},[{user_id:U.b2b,role_in_action:'Apoio'}])).rejects.toThrow()
    await saveAction(null,{...action(),start_time:'10:00',end_time:'11:00'},[])
    await db.query(`update school_actions set status='cancelada' where id=$1`,[id])
    await saveAction()
    expect((await state('school_actions')).filter((a:any)=>a.status==='agendada')).toHaveLength(2)
  })
  it('ROUTE-01: failed stop insertion preserves plan and original stop IDs',async()=>{
    await asUser(db,U.b2b);const id=await saveRoute()
    const before=await state('route_plans'), previous=await state('route_stops')
    await failOn('route_stops');await asUser(db,U.b2b)
    await expect(saveRoute(id,plan('2098-11-04'),[{...stops[0],visit_minutes:50}])).rejects.toThrow(/falha controlada/)
    expect(await state('route_plans')).toEqual(before);expect(await state('route_stops')).toEqual(previous)
  })
  it('ROUTE-01: reorder keeps stop identity and another consultant cannot edit',async()=>{
    await asUser(db,U.b2b);const id=await saveRoute();const old=(await state('route_stops'))[0] as any
    await asUser(db,U.b2b);await saveRoute(id,plan('2098-11-04'),[{...stops[0],sort_order:2}])
    expect((await state('route_stops'))[0]).toMatchObject({id:old.id,sort_order:2})
    await asUser(db,U.outro);await expect(saveRoute(id)).rejects.toThrow(/permissão/)
  })
  it('ROUTE-01: open return remains valid and an inverted return is rejected in the database',async()=>{
    await asUser(db,U.b2b)
    const id=await saveRoute(null,{...plan(),departure_time:'09:00'} as any)
    await expect(saveRoute(id,{...plan(),departure_time:'09:00',return_time:'08:00'} as any)).rejects.toThrow()
    expect((await state('route_plans'))[0]).toMatchObject({id,departure_time:'09:00:00',return_time:null})
  })
  it('SAVE-01: company/contact failure rolls back all company edits',async()=>{
    const before=await state('companies');await failOn('company_contacts');await asUser(db,U.b2b)
    await expect(db.query(`select save_b2b_company_atomic($1,$2,null)`,[JSON.stringify({id:C,razao_social:'Alterada'}),JSON.stringify([{nome:'Fictício',position:0}])])).rejects.toThrow(/falha controlada/)
    expect(await state('companies')).toEqual(before)
  })
  it('SAVE-01: interaction and next step save together, including reload query',async()=>{
    await asUser(db,U.b2b)
    const aid=crypto.randomUUID()
    await db.query(`select save_b2b_interaction_atomic($1,$2)`,[JSON.stringify({id:aid,company_id:C,data:'2098-11-03',tipo:'Visita',etapa_nova:'Diagnóstico realizado'}),JSON.stringify({id:C,ultimo_contato:'2098-11-03',etapa:'Diagnóstico realizado',proxima_acao:'Retornar',data_proxima_acao:'2098-11-04'})])
    expect((await db.query(`select proxima_acao from companies where id=$1`,[C])).rows[0]).toEqual({proxima_acao:'Retornar'})
    expect((await db.query(`select id from activities where id=$1`,[aid])).rows).toHaveLength(1)
  })
  it('SAVE-01: interaction rolls back when next step is invalid; other-owner write denied',async()=>{
    await asUser(db,U.b2b)
    await expect(db.query(`select save_b2b_interaction_atomic($1,$2)`,[JSON.stringify({id:crypto.randomUUID(),company_id:C,data:'2098-11-03',tipo:'Visita'}),JSON.stringify({id:C,next_action_start_time:'15:00',next_action_end_time:'14:00'})])).rejects.toThrow()
    expect(await state('activities')).toHaveLength(0)
    await asUser(db,U.outro)
    await expect(db.query(`select save_b2b_company_atomic($1,'[]',null)`,[JSON.stringify({id:C,razao_social:'Indevida'})])).rejects.toThrow(/outra carteira|permissão/)
  })
  it('DUP-01: canonical CNPJ rejects a formatting duplicate and invalid checksum',async()=>{
    await db.query(`update companies set cnpj='12.345.678/0001-95' where id=$1`,[C])
    await expect(db.query(`insert into companies(razao_social,owner_id,cnpj) values('Duplicada',$1,'12345678000195')`,[U.b2b])).rejects.toThrow()
    await expect(db.exec(`update companies set cnpj='123' where id='${C}'`)).rejects.toThrow()
    expect((await db.query<{valid:boolean}>(`select valid_cnpj('00.000.000/E08G-12') valid`)).rows[0].valid).toBe(true)
  })
  it('GOALS-01: row policies isolate individual goals and deny consultant writes',async()=>{
    await db.exec(`insert into goal_types(code,label,unit) values('audit_goal','Meta fictícia','ações') on conflict do nothing`)
    await db.query(`insert into goals(goal_type,scope_type,user_id,target_value,start_at,end_at,status,created_by) values('audit_goal','individual',$1,2,'2098-10-01','2099-04-30','ativa',$3),('audit_goal','individual',$2,3,'2098-10-01','2099-04-30','ativa',$3)`,[U.b2b,U.outro,U.gerente])
    await asUser(db,U.b2b)
    expect((await db.query(`select user_id from goals`)).rows).toEqual([{user_id:U.b2b}])
    await db.exec(`update goals set target_value=999`)
    expect(Number((await db.query<{target_value:string}>(`select target_value from goals`)).rows[0].target_value)).toBe(2)
  })
})
