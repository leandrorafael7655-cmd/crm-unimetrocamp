import fs from 'node:fs'
import assert from 'node:assert/strict'
import {createClient} from '@supabase/supabase-js'
const config=JSON.parse(fs.readFileSync(process.env.AUDIT_TEST_CONFIG,'utf8'))
assert.ok(config.url.includes('ktmcksngmhxtdnxunntl.supabase.co'),'Isolated homologation only')
const client=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}}),results=[]
for(const table of ['profiles','companies','goals','school_actions','calendar_events']){
 const response=await client.from(table).select('id').limit(1)
 assert.ok(response.error || response.data.length===0,'Anonymous data denied: '+table)
}
results.push({id:'ANON-REAL',details:'Leitura sem sessão não expôs nenhuma linha em cinco tabelas protegidas'})
const user=config.users.find(u=>u.name==='gerente')
const ok=async(query)=>{const r=await query;assert.equal(r.error,null,r.error?.message);return r.data}
await ok(client.auth.signInWithPassword(user))
const id=crypto.randomUUID(),first=crypto.randomUUID(),second=crypto.randomUUID()
const company={id,razao_social:'[AUDITORIA CRUD] Empresa descartável',owner_id:user.id},contacts=[{id:first,nome:'Fictício 1',position:0,is_primary:true},{id:second,nome:'Fictício 2',position:1,is_primary:false}]
await ok(client.rpc('save_b2b_company_atomic',{p_company:company,p_contacts:contacts,p_agreement:null,p_create:true}))
const next=contacts.map(c=>({...c,is_primary:c.id===second}))
await ok(client.rpc('save_b2b_company_atomic',{p_company:{...company,razao_social:company.razao_social+' editada'},p_contacts:next,p_agreement:{ativo:true,status:'Em negociação'}}))
const saved=await ok(client.from('company_contacts').select('id,is_primary').eq('company_id',id).order('position'))
assert.deepEqual(saved,next.map(({id,is_primary})=>({id,is_primary})))
assert.equal((await ok(client.from('agreements').select('id').eq('company_id',id))).length,1)
results.push({id:'CONTACTS-REAL',details:'Dois contatos, troca do principal com IDs estáveis e convênio salvos e consultados no banco real'})
const activity=crypto.randomUUID()
await ok(client.rpc('save_b2b_interaction_atomic',{p_activity:{id:activity,company_id:id,data:'2098-11-03',tipo:'Visita',etapa_nova:'Diagnóstico realizado'},p_company:{id,ultimo_contato:'2098-11-03',etapa:'Diagnóstico realizado',proxima_acao:'Retorno fictício',data_proxima_acao:'2098-11-04'}}))
assert.equal((await ok(client.from('companies').select('proxima_acao').eq('id',id).single())).proxima_acao,'Retorno fictício')
assert.equal((await ok(client.from('activities').select('id').eq('id',activity))).length,1)
results.push({id:'INTERACTION-REAL',details:'Interação, histórico e próximo passo confirmados por consultas novas no banco real'})
const refused=await client.rpc('save_b2b_company_atomic',{p_company:{id},p_contacts:[],p_agreement:null,p_delete:true})
assert.equal(refused.error?.code,'23503','Existing portfolio history must not be deleted implicitly')
assert.equal((await ok(client.from('companies').select('id').eq('id',id))).length,1)
assert.deepEqual(await ok(client.from('company_contacts').select('id,is_primary').eq('company_id',id).order('position')),saved)
results.push({id:'B2B-DELETE-RESTRICTION',details:'Exclusão física recusada pela FK existente do histórico; empresa e contatos preservados. Decisão de arquivamento/exclusão permanece pendente, sem apagar histórico para fazer um teste passar.'})
await client.auth.signOut()
fs.writeFileSync(process.env.AUDIT_TEST_OUTPUT,JSON.stringify({layer:'Auth/REST reais em homologação isolada',results},null,2));console.log(JSON.stringify(results))
