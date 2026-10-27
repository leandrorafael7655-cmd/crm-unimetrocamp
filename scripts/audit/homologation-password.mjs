import fs from 'node:fs'
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
const file=process.env.AUDIT_TEST_CONFIG,config=JSON.parse(fs.readFileSync(file,'utf8'))
assert.ok(config.url.includes('ktmcksngmhxtdnxunntl.supabase.co'),'Isolated homologation only')
const user=config.users.find(u=>u.name==='outro'),oldPassword=user.password
const client=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}})
assert.equal((await client.auth.signInWithPassword(user)).error,null)
assert.equal((await client.from('profiles').select('must_change_password').eq('id',user.id).single()).data.must_change_password,true)
assert.ok((await client.from('profiles').update({must_change_password:false}).eq('id',user.id)).error)
assert.ok((await client.rpc('save_route_plan_atomic',{p_id:null,p_plan:{route_name:'[AUDITORIA] Bloqueada',plan_date:'2098-11-08',avg_visit_minutes:30,status:'rascunho'},p_stops:[]})).error)
const password='Audit!'+randomBytes(24).toString('base64url')+'9a'
const changed=await client.auth.updateUser({password})
assert.equal(changed.error,null,changed.error?.message)
user.password=password
fs.writeFileSync(file,JSON.stringify(config,null,2),{mode:0o600})
assert.equal((await client.from('profiles').select('must_change_password,password_reset_pending').eq('id',user.id).single()).data.must_change_password,false)
await client.auth.signOut()
assert.ok((await client.auth.signInWithPassword({email:user.email,password:oldPassword})).error)
assert.equal((await client.auth.signInWithPassword(user)).error,null)
await client.auth.signOut()
const result={layer:'Supabase Auth/REST reais em homologação',checks:['Troca obrigatória não pode ser removida por REST','Operação comercial bloqueada durante troca pendente','Auth confirmou alteração efetiva e o gatilho liberou o perfil','Senha anterior recusada e nova senha autenticada'],limit:'Não testa solicitação, entrega, link ou expiração de recuperação por e-mail; nenhuma mensagem enviada.'}
fs.writeFileSync(process.env.AUDIT_TEST_OUTPUT,JSON.stringify(result,null,2));console.log(JSON.stringify(result))
