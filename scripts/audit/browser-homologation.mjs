import fs from 'node:fs'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {createClient} from '@supabase/supabase-js'
const config=JSON.parse(fs.readFileSync(process.env.AUDIT_TEST_CONFIG,'utf8'))
assert.ok(config.url.includes('ktmcksngmhxtdnxunntl.supabase.co'),'Isolated homologation only')
const origin=process.env.AUDIT_APP_URL || 'http://127.0.0.1:3000'
assert.ok(origin.startsWith('http://127.0.0.1:')||origin.startsWith('http://localhost:'),'Use the local app connected to isolated homologation')
for(let attempt=0;attempt<120;attempt++){
 try {const response=await fetch(origin+'/auth/login',{signal:AbortSignal.timeout(10000)});if(response.ok) break; if(attempt<2)console.log('Local readiness HTTP',response.status)} catch(e) {if(attempt<2)console.log('Local readiness',e.message)}
 if(attempt===119) throw new Error('Local application did not become ready')
 await new Promise(resolve=>setTimeout(resolve,500))
}
const proxyUrl=process.env.HTTPS_PROXY ? new URL(process.env.HTTPS_PROXY) : null
process.env.PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK='1'
const browser=await chromium.launch({headless:true,...(proxyUrl?{proxy:{server:proxyUrl.origin,bypass:'127.0.0.1,localhost',...(proxyUrl.username?{username:decodeURIComponent(proxyUrl.username),password:decodeURIComponent(proxyUrl.password)}:{})}}:{})})
const results=[],errors=[],timings=[],failures=[]
const record=(id,details)=>{results.push({id,layer:'Navegador local → aplicação Next.js → Auth/banco Supabase reais de homologação',details});console.log(JSON.stringify(results.at(-1)))}
try{
 for(const role of (process.env.AUDIT_BROWSER_ROLES || 'b2b,hs,supervisor,gerente').split(',')){
  console.log('Starting authenticated browser case',role)
  const context=await browser.newContext({viewport:{width:1366,height:768},ignoreHTTPSErrors:true})
  // Forward through the executor's HTTP egress; use unmodified responses from the real backend.
  await context.route(config.url+'/**',async route=>{
    const request=route.request(),headers=await request.allHeaders()
    for(const key of ['host','connection','content-length','accept-encoding']) delete headers[key]
    const response=await fetch(request.url(),{method:request.method(),headers,body:request.postDataBuffer(),redirect:'manual',signal:AbortSignal.timeout(20000)})
    const outgoing=Object.fromEntries(response.headers)
    for(const key of ['content-encoding','content-length','transfer-encoding']) delete outgoing[key]
    await route.fulfill({status:response.status,headers:outgoing,body:Buffer.from(await response.arrayBuffer())})
  })
  const page=await context.newPage();page.on('pageerror',e=>errors.push({role,message:e.message}))
  page.setDefaultTimeout(90000)
  page.setDefaultNavigationTimeout(90000)
  const user=config.users.find(u=>u.name===role)
  try {
  await page.goto(origin+'/auth/login?next=/gestao/metas',{waitUntil:'domcontentloaded'})
  console.log('Login form loaded',role)
  await page.getByLabel('E-mail corporativo',{exact:true}).fill(user.email)
  await page.getByLabel('Senha',{exact:true}).fill(user.password)
  await page.getByRole('button',{name:'Entrar',exact:true}).click()
  await page.waitForURL(url=>!url.pathname.startsWith('/auth'),{waitUntil:'commit',timeout:90000})
  const navigationStart=Date.now()
  await page.goto(origin+'/gestao/metas',{waitUntil:'commit'});await page.getByRole('heading',{name:'Central de Metas',exact:true}).waitFor()
  timings.push({role,step:'direct-goals',ms:Date.now()-navigationStart})
  assert.ok(page.url().includes('/gestao/metas'),'Metas URL must remain accessible for '+role)
  assert.ok(!(await page.locator('body').innerText()).includes('Application error'),'No server error on own goals')
  await page.reload({waitUntil:'commit'});await page.getByRole('heading',{name:'Central de Metas',exact:true}).waitFor()
  assert.ok(page.url().includes('/gestao/metas'),'Direct reload preserves own goals for '+role)
  record('GOALS-01-BROWSER-'+role,'Login, acesso direto e recarga da Central de Metas concluídos')
  if(role==='b2b'){
    assert.ok((await page.locator('body').innerText()).includes('Não disponível'),'Unimplemented metric must not display zero')
    record('METRIC-01-BROWSER','Indicador sem origem transacional aparece como Não disponível, sem progresso inventado')
    await page.goto(origin+'/gestao/configuracoes',{waitUntil:'domcontentloaded'});assert.ok(!page.url().includes('/gestao/configuracoes'))
    record('CONFIG-ACCESS-BROWSER','Consultor redirecionado ao tentar configurações gerenciais')
    await page.goto(origin+'/?view=carteira',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Nova empresa',exact:true}).waitFor()
    fs.writeFileSync('/workspace/scratch/86c3d523b438/fix-evidence/browser-b2b-controls.txt',await page.locator('body').innerText())
    const suffix=String(Date.now()),name='[AUDITORIA UI] Empresa '+suffix,display='Fictícia UI '+suffix
    await page.getByRole('button',{name:'Nova empresa',exact:true}).click()
    let dialog=page.getByRole('dialog',{name:'Nova empresa',exact:true})
    await dialog.getByLabel('Razão social',{exact:true}).fill(name)
    await dialog.getByLabel('Nome fantasia',{exact:true}).fill(display)
    await dialog.getByRole('button',{name:'Salvar empresa',exact:true}).click()
    await dialog.waitFor({state:'hidden'})
    await page.getByPlaceholder('Buscar por nome, CNPJ ou cidade').fill(display)
    await page.getByText(display,{exact:true}).click()
    await page.getByRole('dialog').getByRole('button',{name:'Editar',exact:true}).click()
    dialog=page.getByRole('dialog',{name:'Editar empresa',exact:true})
    await dialog.getByLabel('Razão social',{exact:true}).fill(name+' editada')
    await dialog.getByRole('button',{name:'Salvar empresa',exact:true}).click()
    await dialog.waitFor({state:'hidden'})
    await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Nova empresa',exact:true}).waitFor()
    await page.getByPlaceholder('Buscar por nome, CNPJ ou cidade').fill(display)
    assert.equal(await page.getByText(display,{exact:true}).count(),1)
    const database=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}})
    assert.equal((await database.auth.signInWithPassword(user)).error,null)
    const persisted=await database.from('companies').select('id,owner_id,razao_social').eq('razao_social',name+' editada').single()
    assert.equal(persisted.error,null);assert.equal(persisted.data.owner_id,user.id)
    record('SAVE-01-BROWSER-PERSISTENCE','Cadastro, busca, edição e recarga pela interface; nova sessão Auth confirmou registro editado e proprietário no banco real')
    await page.getByRole('button',{name:'Nova empresa',exact:true}).click()
    dialog=page.getByRole('dialog',{name:'Nova empresa',exact:true})
    const fault='[AUDITORIA FALHA] '+suffix
    await dialog.getByLabel('Razão social',{exact:true}).fill(fault)
    await dialog.getByRole('button',{name:'Salvar empresa',exact:true}).click()
    await dialog.getByText('Não foi possível salvar.',{exact:false}).waitFor()
    assert.equal(await dialog.getByLabel('Razão social',{exact:true}).inputValue(),fault)
    const refused=await database.from('companies').select('id').eq('razao_social',fault)
    assert.equal(refused.error,null);assert.equal(refused.data.length,0)
    record('SAVE-01-BROWSER-FAILURE','Falha controlada do PostgreSQL manteve formulário aberto e preenchido; consulta real confirmou zero registros salvos')
    await dialog.getByRole('button',{name:'Cancelar',exact:true}).click()
    await database.auth.signOut()
  }
  await page.setViewportSize({width:375,height:812})
  await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('heading').first().waitFor()
  const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)
  assert.ok(fits,'No horizontal page clipping at 100% for '+role)
  record('RESPONSIVE-REAL-'+role,'Navegador de 375px, zoom padrão 100%, recarga autenticada sem transbordamento horizontal')
  } catch(error) {
    let message=error.message
    for(const fixture of config.users) message=message.replaceAll(fixture.password,'[redacted]')
    failures.push({role,message})
    console.log('Browser case failed',role,message.split('\n')[0])
  } finally {await context.close()}
 }
 assert.deepEqual(failures,[],'Every requested browser profile completes its scenarios')
 assert.deepEqual(errors,[],'No page errors in authenticated goals flow')
}finally{
 fs.writeFileSync(process.env.AUDIT_TEST_OUTPUT,JSON.stringify({results,errors,failures,timings,transport:'Chamadas do navegador à homologação encaminhadas por HTTP sem simular respostas; servidor Next.js e Supabase reais'},null,2));await browser.close()
}
