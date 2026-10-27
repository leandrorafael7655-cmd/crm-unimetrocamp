import fs from 'node:fs'
import assert from 'node:assert/strict'
import {createClient} from '@supabase/supabase-js'
const file=process.env.AUDIT_TEST_CONFIG
if(!file) throw new Error('Supply a private fixture config, never production credentials')
const config=JSON.parse(fs.readFileSync(file,'utf8'))
if(!config.url.includes('ktmcksngmhxtdnxunntl.supabase.co') || config.url.includes('snixwajvzaxldglcwnig')) throw new Error('Only isolated audit project is allowed')
const results=[]
function record(id,observed){results.push({id,layer:'Supabase Auth/REST reais em homologação isolada',observed});console.log(JSON.stringify(results.at(-1)))}
const attack=config.users.find(u=>u.name==='attack')
const client=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}})
const {data,error}=await client.auth.signInWithPassword({email:attack.email,password:attack.password})
assert.equal(error,null,error?.message);assert.ok(data.session)
record('AUTH-LOGIN-INACTIVE','Auth confirmou senha fictícia; o perfil inativo continua sem acesso comercial')
const changed=await client.auth.updateUser({data:{role:'gerente',active:true,must_change_password:false}})
assert.equal(changed.error,null)
const rpc=await client.rpc('save_route_plan_atomic',{p_id:null,p_plan:{route_name:'Ataque fictício',plan_date:'2098-11-03',avg_visit_minutes:30,status:'rascunho'},p_stops:[]})
assert.ok(rpc.error,'Inactive signup must not receive operational access')
record('SEC-01-METADATA','Metadados alterados no Auth real; RPC comercial recusada ao perfil inativo')
const signout=await client.auth.signOut();assert.equal(signout.error,null)
record('AUTH-LOGOUT','Logout real concluído')
const output=process.env.AUDIT_TEST_OUTPUT || 'homologation-auth-results.json'
fs.writeFileSync(output,JSON.stringify(results,null,2))
