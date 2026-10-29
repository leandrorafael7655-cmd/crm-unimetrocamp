import fs from 'node:fs'
import {spawn} from 'node:child_process'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {chromium} from 'playwright'
import {createClient} from '@supabase/supabase-js'
import {createServerClient} from '@supabase/ssr'

// This runner never targets a published app or the official database.
const config=JSON.parse(fs.readFileSync(process.env.AUDIT_TEST_CONFIG,'utf8'))
assert.equal(new URL(config.url).hostname,'ktmcksngmhxtdnxunntl.supabase.co')
assert.ok(process.env.AUDIT_TEST_OUTPUT,'Provide a sanitized evidence destination')
const cases=(process.env.AUDIT_REMAINING_CASES||'NOSESSION-UI,DEMO-CRUD-UI,SCHOOL-CRUD-CAPTURE-UI').split(',')
assert.ok(cases.length && cases.every(id=>['NOSESSION-UI','DEMO-CRUD-UI','SCHOOL-CRUD-CAPTURE-UI'].includes(id)),'Select known scenarios; never pass by skipping every test')
const origin='http://127.0.0.1:3011',results=[],failures=[],errors=[]
const app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3011'],{
  env:{...process.env,UNICONECTA_DISABLE_EXTERNAL_COMMUNICATIONS:'true'},stdio:['ignore','ignore','pipe'],
})
app.stderr.on('data',()=>{})
let browser
const clients=[]
const record=(id,details,layer='Navegador → Next.js local → Supabase Auth/PostgreSQL reais de homologação')=>{
  results.push({id,layer,details});console.log(JSON.stringify(results.at(-1)))
}
const checked=async(query)=>{const r=await query;assert.equal(r.error,null,r.error?.message);return r.data}
async function contextFor(role){
  const context=await browser.newContext({viewport:{width:1366,height:900}})
  await context.route(config.url+'/**',async route=>{
    const req=route.request(),headers=await req.allHeaders()
    for(const k of ['host','connection','content-length','accept-encoding'])delete headers[k]
    const response=await fetch(req.url(),{method:req.method(),headers,body:req.postDataBuffer(),signal:AbortSignal.timeout(30000)})
    const responseHeaders=Object.fromEntries(response.headers)
    for(const k of ['content-encoding','content-length','transfer-encoding'])delete responseHeaders[k]
    await route.fulfill({status:response.status,headers:responseHeaders,body:Buffer.from(await response.arrayBuffer())})
  })
  if(role){
    const cookies=[],user=config.users.find(u=>u.name===role)
    const auth=createServerClient(config.url,config.key,{cookies:{getAll:()=>[],setAll:values=>cookies.push(...values)}})
    await checked(auth.auth.signInWithPassword({email:user.email,password:user.password}))
    await context.addCookies(cookies.map(({name,value})=>({name,value,url:origin})))
    clients.push(auth)
  }
  const page=await context.newPage()
  page.setDefaultTimeout(60000);page.setDefaultNavigationTimeout(90000)
  page.on('pageerror',e=>errors.push(e.message))
  return {context,page}
}
async function run(id,fn){
  if(!cases.includes(id))return
  try{await fn()}catch(e){
    let message=e.message
    for(const u of config.users)message=message.replaceAll(u.password,'[redacted]')
    failures.push({id,message});console.log(JSON.stringify({failed:id,message}))
  }
}
try{
  for(let i=0;i<60;i++){
    try{if((await fetch(origin+'/auth/login')).ok)break}catch{}
    if(i===59)throw new Error('Local Next.js did not become ready')
    await new Promise(r=>setTimeout(r,500))
  }
  browser=await chromium.launch({headless:true})
  await run('NOSESSION-UI',async()=>{
    const {context,page}=await contextFor()
    try{
      for(const path of ['/gestao/metas','/high-school/escolas','/mapa/rotas']){
        await page.goto(origin+path)
        assert.ok(new URL(page.url()).pathname.startsWith('/auth/login'),path+' must require login')
      }
      record('NOSESSION-UI','Metas, escolas e rotas por URL direta redirecionaram a login sem sessão; nenhum conteúdo protegido foi renderizado')
    }finally{await context.close()}
  })
  await run('DEMO-CRUD-UI',async()=>{
    const {context,page}=await contextFor(),name='[DEMO AUDITORIA] '+Date.now()
    let remoteCalls=0
    context.on('request',request=>{if(new URL(request.url()).hostname.endsWith('.supabase.co'))remoteCalls++})
    try{
      await page.goto(origin+'/demo?view=carteira')
      await page.getByRole('button',{name:/Consultor 1/}).click()
      await page.getByText('Demonstração · dados salvos somente neste navegador.',{exact:false}).waitFor()
      await page.getByRole('button',{name:'Nova empresa',exact:true}).click()
      let dialog=page.getByRole('dialog',{name:'Nova empresa',exact:true})
      await dialog.getByLabel('Razão social',{exact:true}).fill(name)
      await dialog.getByLabel('Nome fantasia',{exact:true}).fill(name)
      await dialog.getByRole('button',{name:'Salvar empresa',exact:true}).click()
      await dialog.waitFor({state:'hidden'})
      await page.reload()
      await page.getByPlaceholder('Buscar por nome, CNPJ ou cidade').fill(name)
      await page.getByText(name,{exact:true}).first().click()
      await page.getByRole('dialog').getByRole('button',{name:'Editar',exact:true}).click()
      dialog=page.getByRole('dialog',{name:'Editar empresa',exact:true})
      await dialog.getByLabel('Razão social',{exact:true}).fill(name+' editada')
      await dialog.getByRole('button',{name:'Salvar empresa',exact:true}).click()
      await dialog.waitFor({state:'hidden'})
      await page.reload()
      const local=await page.evaluate(()=>JSON.parse(localStorage.getItem('unimetrocamp:empresas')))
      assert.ok(local.some(e=>e.razaoSocial===name+' editada'))
      await page.getByPlaceholder('Buscar por nome, CNPJ ou cidade').fill(name)
      await page.getByText(name,{exact:true}).first().click()
      await page.getByRole('dialog').getByRole('button',{name:'Editar',exact:true}).click()
      assert.equal(await page.getByRole('button',{name:'Excluir empresa',exact:true}).count(),0,'Consultor cannot delete')
      await page.goto(origin+'/demo')
      await page.getByRole('button',{name:'trocar usuário',exact:true}).click()
      await page.getByRole('button',{name:/Gerência Comercial/}).click()
      await page.goto(origin+'/demo?view=empresas')
      await page.getByPlaceholder('Buscar por nome, CNPJ ou cidade').fill(name)
      await page.getByText(name,{exact:true}).first().click()
      await page.getByRole('dialog').getByRole('button',{name:'Editar',exact:true}).click()
      await page.getByRole('dialog').getByRole('button',{name:'Excluir empresa',exact:true}).click()
      await page.getByRole('dialog').getByRole('button',{name:'Sim, excluir',exact:true}).click()
      await page.getByRole('dialog').waitFor({state:'hidden'})
      await page.reload()
      const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('unimetrocamp:empresas')))
      assert.ok(!after.some(e=>e.nomeFantasia===name))
      assert.equal(remoteCalls,0,'Demo must never write to Supabase')
      record('DEMO-CRUD-UI','Consultor cadastrou, buscou e editou com persistência após recarga e sem opção de exclusão; gerência excluiu após troca de usuário. Banner visível; zero requisições Supabase','Navegador → Next.js local → localStorage; sem backend simulado e sem banco')
    }finally{await context.close()}
  })
  await run('SCHOOL-CRUD-CAPTURE-UI',async()=>{
    const {context,page}=await contextFor('hs'),name='[AUDITORIA UI HS] '+Date.now()
    const hs=config.users.find(u=>u.name==='hs'),manager=config.users.find(u=>u.name==='gerente')
    const db=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}})
    const admin=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}})
    clients.push(db,admin)
    await checked(db.auth.signInWithPassword(hs));await checked(admin.auth.signInWithPassword(manager))
    try{
      await page.goto(origin+'/high-school/escolas')
      await page.getByRole('button',{name:'Nova escola',exact:true}).first().click()
      let dialog=page.getByRole('dialog')
      await dialog.getByLabel('Nome da escola *',{exact:true}).fill(name)
      await dialog.getByLabel('Cidade',{exact:true}).fill('Cidade fictícia')
      await dialog.getByLabel('CNPJ (opcional)',{exact:true}).fill('123')
      await dialog.getByRole('button',{name:'Salvar',exact:true}).click()
      await dialog.getByText('CNPJ inválido.',{exact:true}).waitFor()
      assert.equal(await dialog.getByLabel('Nome da escola *',{exact:true}).inputValue(),name)
      await dialog.getByLabel('CNPJ (opcional)',{exact:true}).fill('')
      await dialog.getByRole('button',{name:'Salvar',exact:true}).click()
      await page.waitForURL(/\/high-school\/escolas\/[0-9a-f-]+$/)
      await page.getByRole('heading',{name,exact:true}).waitFor()
      const schoolId=new URL(page.url()).pathname.split('/').at(-1)
      await page.getByRole('button',{name:'Editar escola',exact:true}).click()
      dialog=page.getByRole('dialog')
      await dialog.getByLabel('Nome da escola *',{exact:true}).fill(name+' editada')
      await dialog.locator('select[name="classificacao"]').selectOption('Ouro')
      await dialog.getByRole('button',{name:'Salvar',exact:true}).click()
      await dialog.waitFor({state:'hidden'});await page.reload()
      await page.getByRole('heading',{name:name+' editada',exact:true}).waitFor()
      const school=await checked(db.from('schools').select('name,classification,cidade').eq('id',schoolId).single())
      assert.equal(school.name,name+' editada');assert.equal(school.classification,'Ouro')
      await page.goto(origin+'/high-school/escolas?busca='+encodeURIComponent(name)+'&classificacao=Ouro')
      assert.equal(await page.getByRole('link',{name:name+' editada',exact:true}).count(),1)
      record('SCHOOL-CRUD-UI','High School criou e editou escola pela interface; CNPJ inválido recusado com formulário preservado; classificação/busca, recarga e nova consulta ao banco confirmaram a gravação')
      const cycleIds=[randomUUID(),randomUUID()]
      await checked(admin.from('supervest_cycles').insert(cycleIds.map((id,i)=>({id,name:'[AUDITORIA UI] Edição '+id.slice(0,8),capture_academic_year:2099+i,campaign_start_at:`${2098+i}-10-01`,campaign_end_at:`${2099+i}-09-30`,created_by:manager.id}))))
      await page.goto(origin+'/high-school/captacao-escolas?ciclo='+cycleIds[0])
      await page.getByLabel('Nome da escola',{exact:true}).fill(name)
      await page.getByRole('button',{name:'Kanban',exact:true}).click()
      const card=()=>page.locator(`[data-capture-card="${schoolId}"]`)
      await card().getByRole('button',{name:'Registrar contato',exact:true}).click()
      dialog=page.locator('dialog[open]').last()
      await dialog.locator('select[name="negotiationStatus"]').selectOption('em_negociacao')
      await dialog.getByLabel('Data *',{exact:true}).fill('2098-11-09')
      await dialog.getByLabel('Horário *',{exact:true}).fill('10:00')
      await dialog.getByLabel('Pessoa contatada *',{exact:true}).fill('Direção fictícia')
      await dialog.getByLabel('Descrição do contato *',{exact:true}).fill('Contato fictício para validar persistência e separação por edição.')
      await dialog.getByRole('button',{name:'Salvar registro',exact:true}).click()
      await dialog.waitFor({state:'hidden'})
      await page.locator(`[data-capture-column="negotiating"] [data-capture-card="${schoolId}"]`).waitFor()
      await page.getByRole('button',{name:'Lista',exact:true}).click()
      assert.equal(await page.getByLabel('Nome da escola',{exact:true}).inputValue(),name)
      await page.reload()
      await page.getByLabel('Nome da escola',{exact:true}).fill(name)
      await page.getByRole('button',{name:'Kanban',exact:true}).click()
      await page.locator(`[data-capture-column="negotiating"] [data-capture-card="${schoolId}"]`).waitFor()
      await page.getByLabel('Edição do SuperVestibular').selectOption(cycleIds[1])
      await page.locator(`[data-capture-column="no_contact"] [data-capture-card="${schoolId}"]`).waitFor()
      await page.getByLabel('Edição do SuperVestibular').selectOption(cycleIds[0])
      await card().getByRole('button',{name:'Agendar ação',exact:true}).click()
      dialog=page.locator('dialog[open]').last()
      await dialog.getByLabel('Data *',{exact:true}).fill('2098-11-10')
      await dialog.getByLabel('Horário inicial *',{exact:true}).fill('10:00')
      await dialog.getByLabel('Horário final *',{exact:true}).fill('11:00')
      await dialog.getByLabel('Local *',{exact:true}).fill('Local fictício de homologação')
      await dialog.getByRole('button',{name:'Salvar registro',exact:true}).click()
      await dialog.waitFor({state:'hidden'})
      const action=await checked(db.from('school_actions').select('id,supervest_cycle_id').eq('school_id',schoolId).single())
      assert.equal(action.supervest_cycle_id,cycleIds[0])
      await page.goto(origin+'/high-school/agenda?ciclo='+cycleIds[0])
      await page.locator(`[data-school-action-id="${action.id}"]`).waitFor()
      await page.reload()
      await page.locator(`[data-school-action-id="${action.id}"]`).waitFor()
      const events=await checked(db.from('calendar_events').select('id,status').eq('source_id',action.id).eq('recipient_user_id',hs.id))
      assert.equal(events.filter(e=>e.status==='active').length,1)
      await page.goto(origin+'/high-school/agenda?ciclo='+cycleIds[1])
      assert.equal(await page.locator(`[data-school-action-id="${action.id}"]`).count(),0)
      record('SCHOOL-CAPTURE-AGENDA-UI','Atuação mudou o Kanban e persistiu após recarga; lista e filtros preservados; edição seguinte permaneceu sem contato. Ação criada pela UI apareceu na Agenda High School após recarga, somente na edição correta, com uma projeção ativa do principal no banco')
    }finally{await context.close()}
  })
  assert.deepEqual(failures,[],'All new scenarios must complete')
  assert.deepEqual(errors,[],'No browser JavaScript errors')
  assert.equal(results.length,cases.reduce((count,id)=>count+(id==='SCHOOL-CRUD-CAPTURE-UI'?2:1),0),'All selected results must be recorded')
}finally{
  await Promise.allSettled(clients.map(c=>c.auth.signOut()))
  await browser?.close();app.kill('SIGTERM')
  fs.writeFileSync(process.env.AUDIT_TEST_OUTPUT,JSON.stringify({results,failures,errors,limits:['Somente aplicação local e homologação isolada; não testa produção','Não comprova envio/recebimento de e-mails, Microsoft Graph ou Minha Agenda dependente de Admin SDK']},null,2))
}
