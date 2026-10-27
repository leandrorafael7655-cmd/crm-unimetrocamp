import fs from 'node:fs'
import assert from 'node:assert/strict'
import {performance} from 'node:perf_hooks'
import {createClient} from '@supabase/supabase-js'
const config=JSON.parse(fs.readFileSync(process.env.AUDIT_TEST_CONFIG,'utf8'))
assert.ok(config.url.includes('ktmcksngmhxtdnxunntl.supabase.co')&&!config.url.includes('snixwajvzaxldglcwnig'),'Never run against production')
const result=[], clients={}
const ids=Object.fromEntries(config.users.map(u=>[u.name,u.id]))
const record=(id,details)=>{result.push({id,layer:'Auth e banco Supabase reais em homologação isolada',details});console.log(JSON.stringify(result.at(-1)))}
const checked=async(query,label)=>{const r=await query;assert.equal(r.error,null,`${label}: ${r.error?.message}`);return r.data}
for(const user of config.users.filter(u=>u.name!=='attack')) {
 const client=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,options)=>{const path=new URL(url).pathname;const started=Date.now();try{const r=await fetch(url,{...options,signal:AbortSignal.timeout(20000)});if(process.env.AUDIT_DEBUG)console.log(JSON.stringify({request:path,status:r.status,ms:Date.now()-started}));return r}catch(e){if(process.env.AUDIT_DEBUG)console.log(JSON.stringify({request:path,error:e.name,ms:Date.now()-started}));throw e}}}})
 await checked(client.auth.signInWithPassword({email:user.email,password:user.password}),'login '+user.name)
 const self=await checked(client.from('profiles').select('id,role,active').eq('id',user.id).single(),'profile '+user.name)
 assert.equal(self.role,user.role);assert.equal(self.active,true);clients[user.name]=client
}
record('AUTH-PROFILES','Seis identidades fictícias autenticadas: dois gerentes, supervisor, dois B2B e High School')
const b=clients.b2b,h=clients.hs,g=clients.gerente,o=clients.outro
const C='21000000-0000-4000-8000-000000000001',S='21000000-0000-4000-8000-000000000002',contact='21000000-0000-4000-8000-000000000003'
const company={id:C,razao_social:'[AUDITORIA] Empresa fictícia',cnpj:'12.345.678/0001-95'}
const contacts=[{id:contact,nome:'Contato fictício',position:0,is_primary:true}]
await checked(b.rpc('save_b2b_company_atomic',{p_company:company,p_contacts:contacts,p_agreement:null,p_create:true}),'create company')
await checked(b.rpc('save_b2b_company_atomic',{p_company:{...company,razao_social:'[AUDITORIA] Empresa editada'},p_contacts:contacts,p_agreement:null}),'edit company')
const saved=await checked(b.from('companies').select('id,razao_social,owner_id').eq('id',C).single(),'reload company')
assert.equal(saved.razao_social,'[AUDITORIA] Empresa editada');assert.equal(saved.owner_id,ids.b2b)
assert.equal((await checked(b.from('company_contacts').select('id').eq('company_id',C).single(),'contact')).id,contact)
record('SAVE-01-REAL','Cadastro, edição, responsável e contato persistiram em consulta nova pela API real')
assert.ok((await o.rpc('save_b2b_company_atomic',{p_company:{id:C,razao_social:'Indevida'},p_contacts:[],p_agreement:null})).error)
assert.ok((await clients.hs.rpc('save_b2b_company_atomic',{p_company:{id:C,razao_social:'Indevida'},p_contacts:[],p_agreement:null})).error)
assert.ok((await b.from('profiles').update({role:'gerente'}).eq('id',ids.b2b)).error)
assert.equal((await checked(b.from('profiles').select('role').eq('id',ids.b2b).single(),'profile after attack')).role,'consultor_b2b')
assert.ok((await g.rpc('admin_update_crm_profile',{p_actor:ids.gerente,p_target:ids.outro,p_changes:{role:'gerente'}})).error)
record('SEC-01-ACCESS-REAL','Elevação direta de perfil e RPC administrativa via JWT de navegador bloqueadas; edição de carteira alheia e escrita B2B pelo High School recusadas')
const dupe=await b.rpc('save_b2b_company_atomic',{p_company:{...company,id:crypto.randomUUID(),cnpj:'12345678000195'},p_contacts:[],p_agreement:null,p_create:true});assert.ok(dupe.error)
record('DUP-01-REAL','Mesmo CNPJ com e sem pontuação recusado pelo banco real')
const route={route_name:'[AUDITORIA] Rota fictícia',plan_date:'2098-11-03',avg_visit_minutes:30,status:'rascunho'}
const stops=[{entity_type:'company',entity_id:C,sort_order:0,visit_minutes:30}]
const planId=await checked(b.rpc('save_route_plan_atomic',{p_id:null,p_plan:route,p_stops:stops}),'create route')
const routeBefore=await checked(b.from('route_plans').select('*').eq('id',planId).single(),'route before')
const stopsBefore=await checked(b.from('route_stops').select('*').eq('route_plan_id',planId),'stops before')
assert.ok((await b.rpc('save_route_plan_atomic',{p_id:planId,p_plan:{...route,plan_date:'2098-11-04'},p_stops:[{...stops[0],visit_minutes:-1}]})).error)
assert.deepEqual(await checked(b.from('route_plans').select('*').eq('id',planId).single(),'route rollback'),routeBefore)
assert.deepEqual(await checked(b.from('route_stops').select('*').eq('route_plan_id',planId),'stops rollback'),stopsBefore)
await checked(b.rpc('save_route_plan_atomic',{p_id:planId,p_plan:{...route,route_name:'[AUDITORIA] Rota editada'},p_stops:[{...stops[0],sort_order:2}]}),'edit route')
assert.equal((await checked(b.from('route_stops').select('id').eq('route_plan_id',planId).single(),'stable stop')).id,stopsBefore[0].id)
assert.ok((await o.rpc('save_route_plan_atomic',{p_id:planId,p_plan:route,p_stops:stops})).error)
record('ROUTE-01-REAL','Falha após alteração do plano preservou data, paradas e IDs; edição válida manteve ID; outro consultor bloqueado')
await checked(h.from('schools').insert({id:S,name:'[AUDITORIA] Escola fictícia',created_by:ids.hs}),'create school')
const action={school_id:S,action_date:'2098-11-03',start_time:'09:00',end_time:'10:00',action_type:'Visita de relacionamento',status:'agendada',primary_owner_id:ids.hs}
const parts=[{user_id:ids.b2b,role_in_action:'Apoio'}]
const schoolId=await checked(h.rpc('save_school_action_atomic',{p_id:null,p_action:action,p_participants:parts,p_results:[{grade:'em3',leads:2,supervest_registrations:1}]}),'create school action')
const schoolBefore=await checked(h.from('school_actions').select('*').eq('id',schoolId).single(),'school before')
const partsBefore=await checked(h.from('school_action_participants').select('*').eq('school_action_id',schoolId).order('user_id'),'participants before')
const resultsBefore=await checked(h.from('school_action_grade_results').select('*').eq('school_action_id',schoolId),'results before')
const principalBefore=await checked(h.from('calendar_events').select('*').eq('source_id',schoolId).eq('recipient_user_id',ids.hs).single(),'principal calendar')
assert.equal((await checked(b.from('calendar_events').select('id').eq('source_id',schoolId),'support calendar')).length,1)
assert.ok((await h.rpc('save_school_action_atomic',{p_id:schoolId,p_action:{...action,action_date:'2098-11-04'},p_participants:[{user_id:ids.outro,role_in_action:'Apoio'}],p_results:[{grade:'invalid',leads:5}]})).error)
assert.deepEqual(await checked(h.from('school_actions').select('*').eq('id',schoolId).single(),'action rollback'),schoolBefore)
assert.deepEqual(await checked(h.from('school_action_participants').select('*').eq('school_action_id',schoolId).order('user_id'),'people rollback'),partsBefore)
assert.deepEqual(await checked(h.from('school_action_grade_results').select('*').eq('school_action_id',schoolId),'results rollback'),resultsBefore)
record('SCHOOL-02-REAL','Falha em resultado, depois da alteração de data/participantes, preservou integralmente ação, participantes e resultados')
await checked(h.rpc('save_school_action_atomic',{p_id:schoolId,p_action:{...action,action_date:'2098-11-04'},p_participants:[{user_id:ids.outro,role_in_action:'Apoio'}],p_results:[{grade:'em3',leads:4,supervest_registrations:1}]}),'edit school action')
const principalAfter=await checked(h.from('calendar_events').select('*').eq('source_id',schoolId).eq('recipient_user_id',ids.hs).single(),'principal after')
assert.equal(principalAfter.id,principalBefore.id);assert.equal(principalAfter.event_uid,principalBefore.event_uid)
assert.equal((await checked(b.from('calendar_events').select('status').eq('source_id',schoolId).single(),'departed support')).status,'cancelled')
assert.equal((await checked(o.from('calendar_events').select('status').eq('source_id',schoolId).single(),'new support')).status,'active')
assert.equal((await checked(h.from('school_action_grade_results').select('id').eq('school_action_id',schoolId).single(),'result identity')).id,resultsBefore[0].id)
record('SCHOOL-AGENDA-REAL','Principal e apoios atualizados pela API real; ID/UID mantidos e apoio removido recebeu estado de cancelamento na projeção')
for(const [start,end] of [['15:00','14:00'],['15:00','15:00']]) assert.ok((await h.rpc('save_school_action_atomic',{p_id:null,p_action:{...action,start_time:start,end_time:end},p_participants:[],p_results:[]})).error)
record('SCHOOL-01-REAL','Fim anterior ou igual ao início recusado pelo banco real')
const concurrent=await Promise.all([1,2].map(()=>h.rpc('save_school_action_atomic',{p_id:null,p_action:{...action,action_date:'2098-11-06',start_time:'12:00',end_time:'13:00'},p_participants:[],p_results:[]})))
assert.equal(concurrent.filter(r=>!r.error).length,1);assert.equal(concurrent.filter(r=>r.error).length,1)
record('AGENDA-02-CONCURRENCY-REAL','Duas requisições simultâneas do mesmo principal/horário: uma confirmada e outra recusada pelo EXCLUDE do PostgreSQL')
await checked(h.from('school_actions').update({status:'cancelada'}).eq('id',schoolId),'cancel school action')
assert.equal((await checked(h.from('calendar_events').select('status').eq('source_id',schoolId).single(),'cancel principal')).status,'cancelled')
const goalType='b2b_weekly_actions'
await checked(g.from('goals').insert([{goal_type:goalType,scope_type:'individual',user_id:ids.b2b,target_value:2,start_at:'2098-10-01',end_at:'2099-04-30',status:'ativa',created_by:ids.gerente},{goal_type:goalType,scope_type:'individual',user_id:ids.outro,target_value:3,start_at:'2098-10-01',end_at:'2099-04-30',status:'ativa',created_by:ids.gerente}]),'create goals')
const own=await checked(b.from('goals').select('user_id').eq('scope_type','individual'),'own goals')
assert.ok(own.length>0&&own.every(r=>r.user_id===ids.b2b))
record('GOALS-01-RLS-REAL','Consultor lê meta individual própria e não recebe a de outro consultor')
const secondLogin=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,options)=>{const path=new URL(url).pathname;const started=Date.now();try{const r=await fetch(url,{...options,signal:AbortSignal.timeout(20000)});if(process.env.AUDIT_DEBUG)console.log(JSON.stringify({request:path,status:r.status,ms:Date.now()-started}));return r}catch(e){if(process.env.AUDIT_DEBUG)console.log(JSON.stringify({request:path,error:e.name,ms:Date.now()-started}));throw e}}}})
const loginUser=config.users.find(u=>u.name==='b2b');await checked(secondLogin.auth.signInWithPassword({email:loginUser.email,password:loginUser.password}),'new session')
assert.equal((await checked(secondLogin.from('companies').select('razao_social').eq('id',C).single(),'persist after login')).razao_social,'[AUDITORIA] Empresa editada')
record('PERSISTENCE-NEW-LOGIN','Empresa persistida após encerrar contexto de cliente e autenticar em nova sessão real')
for(const client of [...Object.values(clients),secondLogin]) await client.auth.signOut()
fs.writeFileSync(process.env.AUDIT_TEST_OUTPUT,JSON.stringify({project:'ktmcksngmhxtdnxunntl',results:result},null,2))
