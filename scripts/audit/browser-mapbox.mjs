import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {spawn,execFileSync} from 'node:child_process'
import {chromium} from 'playwright'
import {createServerClient} from '@supabase/ssr'

const config=JSON.parse(fs.readFileSync(process.env.AUDIT_TEST_CONFIG,'utf8'))
const {token}=JSON.parse(fs.readFileSync(process.env.AUDIT_MAPBOX_CONFIG,'utf8'))
assert.equal(new URL(config.url).hostname,'ktmcksngmhxtdnxunntl.supabase.co')
assert.ok(/^pk\./.test(token),'Only an existing public Mapbox token is used')
assert.ok(process.env.AUDIT_TEST_OUTPUT)
const origin='http://127.0.0.1:3012',capture=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'audit-mapbox-')),'map.png')
const report={layer:'Navegador autenticado → Next.js local → Supabase de homologação + Mapbox real',requests:[],results:[],failures:[],consoleErrors:[],limits:['Sem geolocalização física ou aparelho real','Telemetria Mapbox bloqueada; nenhum dado comercial alterado','Renderização WebGL por software no executor, com avaliação da captura']}
const app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3012'],{
  env:{...process.env,NEXT_PUBLIC_MAPBOX_TOKEN:token,UNICONECTA_DISABLE_EXTERNAL_COMMUNICATIONS:'true'},stdio:'ignore',
})
let browser,auth
try{
  for(let i=0;i<60;i++){
    try{if((await fetch(origin+'/auth/login')).ok)break}catch{}
    if(i===59)throw new Error('Local app did not become ready')
    await new Promise(r=>setTimeout(r,500))
  }
  browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']})
  const context=await browser.newContext({viewport:{width:1366,height:768}}),cookies=[]
  auth=createServerClient(config.url,config.key,{cookies:{getAll:()=>[],setAll:rows=>cookies.push(...rows)}})
  const user=config.users.find(u=>u.name==='b2b')
  assert.equal((await auth.auth.signInWithPassword(user)).error,null)
  await context.addCookies(cookies.map(({name,value})=>({name,value,url:origin})))
  await context.route('https://events.mapbox.com/**',route=>route.abort())
  for(const base of [config.url,'https://api.mapbox.com'])await context.route(base+'/**',async route=>{
    const q=route.request(),headers=await q.allHeaders()
    for(const k of ['host','connection','content-length','accept-encoding'])delete headers[k]
    const r=await fetch(q.url(),{method:q.method(),headers,body:q.postDataBuffer(),signal:AbortSignal.timeout(30000)}),h=Object.fromEntries(r.headers)
    for(const k of ['content-length','content-encoding','transfer-encoding'])delete h[k]
    if(new URL(q.url()).hostname==='api.mapbox.com')report.requests.push({path:new URL(q.url()).pathname,status:r.status})
    await route.fulfill({status:r.status,headers:h,body:Buffer.from(await r.arrayBuffer())})
  })
  const page=await context.newPage()
  page.setDefaultTimeout(60000);page.setDefaultNavigationTimeout(90000)
  page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text().replaceAll(token,'[redacted]'))})
  await page.goto(origin+'/mapa',{waitUntil:'domcontentloaded'})
  await page.getByRole('heading',{name:'Mapa Comercial',exact:true}).waitFor()
  await page.locator('.mapboxgl-canvas').waitFor()
  let colors=0
  // Receiving tiles does not prove that WebGL painted them. Inspect the map area
  // away from the filter panel/controls, then manually review the final capture.
  for(let i=0;i<20;i++){
    await page.waitForTimeout(1000)
    await page.locator('.mapboxgl-map').screenshot({path:capture})
    colors=Number(execFileSync(process.env.AUDIT_PYTHON||'python',['-c',
      'from PIL import Image; import sys; im=Image.open(sys.argv[1]).convert("RGB"); w,h=im.size; region=im.crop((int(w*.45),80,w-60,h-80)); print(len(region.getcolors(region.width*region.height) or []))',capture],{encoding:'utf8'}).trim())
    if(colors>50)break
  }
  assert.ok(report.requests.some(r=>r.status===200&&/styles/.test(r.path)),'Real style must load')
  assert.ok(report.requests.some(r=>r.status===200&&/\.vector/.test(r.path)),'Real vector tiles must load')
  assert.ok(colors>50,'Map canvas remained uniform after tile loading; rendering is not validated')
  report.results.push({id:'MAPBOX-RENDER-REAL',role:'consultor_b2b',viewport:1366,distinctMapColors:colors,capture})
  await page.setViewportSize({width:375,height:812})
  await page.waitForTimeout(1000)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  report.results.push({id:'MAPBOX-MOBILE-REAL',viewport:375,horizontalOverflow:false})
}catch(error){
  report.failures.push({message:error.message.replaceAll(token,'[redacted]')})
  process.exitCode=1
}finally{
  await browser?.close();await auth?.auth.signOut();app.kill('SIGTERM')
  fs.writeFileSync(process.env.AUDIT_TEST_OUTPUT,JSON.stringify(report,null,2))
  console.log(JSON.stringify(report))
}
