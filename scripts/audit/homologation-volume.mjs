import fs from 'node:fs'
import assert from 'node:assert/strict'
import {performance} from 'node:perf_hooks'
import {transformSync} from 'esbuild'
import {createClient} from '@supabase/supabase-js'
const config=JSON.parse(fs.readFileSync(process.env.AUDIT_TEST_CONFIG,'utf8'))
assert.ok(config.url.includes('ktmcksngmhxtdnxunntl.supabase.co'),'Isolated homologation only')
const source=fs.readFileSync(new URL('../../lib/data/pagination.ts',import.meta.url),'utf8')
const {readAllRows}=await import('data:text/javascript;base64,'+Buffer.from(transformSync(source,{loader:'ts',format:'esm'}).code).toString('base64'))
const user=config.users.find(u=>u.name==='b2b')
const client=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}})
assert.equal((await client.auth.signInWithPassword(user)).error,null)
const pages=[],start=performance.now()
const rows=await readAllRows(async(from,to)=>{
 const started=performance.now()
 const response=await client.from('companies').select('id,razao_social,owner_id').like('razao_social','[AUDITORIA VOLUME]%').order('id').range(from,to)
 pages.push({from,to,count:response.data?.length,ms:Math.round(performance.now()-started)})
 return response
})
assert.equal(rows.length,1001)
assert.equal(new Set(rows.map(r=>r.id)).size,1001)
assert.ok(rows.every(r=>r.owner_id===user.id))
const result={layer:'Auth/REST reais em homologação; 1001 empresas fictícias',count:rows.length,pages,ms:Math.round(performance.now()-start),note:'Tempo inclui rede desta execução; não representa SLA nem teste de carga.'}
await client.auth.signOut()
fs.writeFileSync(process.env.AUDIT_TEST_OUTPUT,JSON.stringify(result,null,2))
console.log(JSON.stringify(result))
