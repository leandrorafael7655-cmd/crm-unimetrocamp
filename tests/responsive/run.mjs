import fs from "node:fs/promises"
import { readFileSync } from "node:fs"
import path from "node:path"
import os from "node:os"
import http from "node:http"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import postcss from "postcss"
import tailwind from "@tailwindcss/postcss"

const requireTools = createRequire(path.join(process.env.RESPONSIVE_TOOLS || "/tmp/uniconecta-responsive-tools", "package.json"))
const { build } = requireTools("esbuild")
const { chromium, webkit } = requireTools("playwright")
const root = process.cwd()
const out = await fs.mkdtemp(path.join(os.tmpdir(), "uniconecta-layout-"))
const fixturePath = path.join(root, "tests/responsive/fixtures.mjs")

function exportsFrom(source) {
  return [...source.matchAll(/export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)/g)].map(m => m[1])
}

const mocks = {
  name: "synthetic-backends",
  setup(builder) {
    builder.onResolve({ filter: /^next\/(link|navigation)$/ }, args => ({ path: args.path, namespace: "next-mock" }))
    builder.onLoad({ filter: /.*/, namespace: "next-mock" }, args => ({
      loader: "jsx", resolveDir: root,
      contents: args.path === "next/link"
        ? 'import React from "react"; export default function Link({href, children, ...rest}) { return <a href={typeof href==="string"?href:href.pathname} {...rest}>{children}</a> }'
        : 'const params = new URLSearchParams(); export const usePathname=()=>window.fixturePath || "/"; export const useSearchParams=()=>params; export const useRouter=()=>({push(){},refresh(){},replace(){}}); export function redirect(to){throw new Error("Unexpected redirect: "+to)}; export function notFound(){throw new Error("Unexpected notFound")}',
    }))
    builder.onResolve({ filter: /^react-map-gl\/mapbox$/ }, () => ({ path: "mapbox", namespace: "map-mock" }))
    builder.onLoad({ filter: /.*/, namespace: "map-mock" }, () => ({
      loader: "jsx", resolveDir: root,
      contents: 'import React from "react"; export default React.forwardRef(function Map({children},ref){ React.useImperativeHandle(ref,()=>({resize(){}})); return <div style={{width:"100%",height:"100%",background:"#e7f5f2"}}>{children}</div> }); export const Marker=({children})=><div>{children}</div>; export const Popup=Marker; export const NavigationControl=()=>null; export const GeolocateControl=()=>null;',
    }))
    builder.onResolve({ filter: /^@\// }, args => {
      if (/^@\/(app\/actions\/|lib\/auth\/guards|lib\/supabase\/(server|client|admin)|lib\/data\/(.*queries|weekly-close|route-preferences))/.test(args.path)) {
        return { path: args.path, namespace: "backend-mock" }
      }
      return { path: path.join(root, args.path.slice(2)) + (path.extname(args.path) ? "" : (readable(path.join(root, args.path.slice(2) + ".tsx")) ? ".tsx" : readable(path.join(root, args.path.slice(2) + ".jsx")) ? ".jsx" : ".ts")) }
    })
    builder.onLoad({ filter: /.*/, namespace: "backend-mock" }, args => {
      const actual = path.join(root, args.path.slice(2) + ".ts")
      const names = exportsFrom(readFileSync(actual, "utf8"))
      const contents = 'import {mockQueries, createMockClient} from '+JSON.stringify(fixturePath)+';\n' +
        names.map(name => /^create.*Client$/.test(name)
          ? 'export const '+name+'=createMockClient;'
          : 'export const '+name+'=mockQueries['+JSON.stringify(name)+'] || (async()=>{throw new Error("Unmocked backend call: '+name+'")});').join("\n")
      return { contents, loader: "js", resolveDir: root }
    })
  },
}
function readable(file) { try { readFileSync(file); return true } catch { return false } }

await build({
  entryPoints: [path.join(root, "tests/responsive/ui.jsx")], outfile: path.join(out, "app.js"),
  bundle: true, platform: "browser", format: "iife", jsx: "automatic",
  define: { "process.env": JSON.stringify({NODE_ENV:"test"}) }, plugins: [mocks],
  nodePaths: [path.join(root, "node_modules")],
})
const css = await postcss([tailwind({base:root})]).process(await fs.readFile("app/globals.css","utf8"), {
  from: path.join(root,"app/globals.css"), to: path.join(out,"app.css"),
})
await fs.writeFile(path.join(out,"app.css"),css.css)
const html = '<!doctype html><html lang="pt-BR"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><body><div id="root"></div><script src="/app.js"></script></body></html>'
const server = http.createServer(async(req,res)=>{
  const file = req.url === "/app.js" ? "app.js" : req.url === "/app.css" ? "app.css" : null
  res.setHeader("content-type", file === "app.js" ? "text/javascript" : file === "app.css" ? "text/css" : "text/html")
  res.end(file ? await fs.readFile(path.join(out,file)) : html)
})
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve))
const url = "http://127.0.0.1:"+server.address().port
await fs.mkdir("responsive-results",{recursive:true})
const results = []
const errors = []
const sizes = [[320,640],[375,812],[768,1024],[1024,768],[1280,720],[1366,768],[1440,900],[1920,1080]]
const names = ["dashboard","b2b","hs","escolas","escola","pipeline","agenda","atendimento","minha-agenda","metas","supervest","rotas","mapa","mapa-interativo","usuarios","reunioes","configuracoes","login","senha","setup"]
let browser, page
async function settle() { await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))) }
async function check(label) {
  await settle()
  const report = await page.evaluate(()=>{
    const viewport = innerWidth
    const shell = document.querySelector(".uni-shell")
    const main = shell?.querySelector(":scope > main")
    const side = shell?.querySelector(":scope > aside")
    const issues = []
    if(document.documentElement.scrollWidth > viewport + 1) issues.push("Page overflow: "+document.documentElement.scrollWidth+" > "+viewport)
    if(main && side && viewport >= 768) {
      const m=main.getBoundingClientRect(), s=side.getBoundingClientRect()
      if(m.left < s.right - 1) issues.push("Sidebar overlaps main")
      if(Math.abs(m.right - viewport) > 1) issues.push("Main does not fill available width")
    }
    for(const el of document.querySelectorAll("button,input,select,textarea")) {
      const r=el.getBoundingClientRect()
      if(!r.width || !r.height || el.closest(".uni-scroll-region")) continue
      if(r.left < -1 || r.right > viewport+1) issues.push("Control outside window: "+(el.textContent || el.name || el.tagName).slice(0,80))
    }
    for(const region of document.querySelectorAll(".uni-scroll-region")) {
      const r=region.getBoundingClientRect()
      if(!r.width || !r.height) continue
      if(r.left < -1 || r.right > viewport+1) issues.push("Scroll region outside window")
      if(!region.querySelector("table") || region.scrollWidth <= region.clientWidth+1) continue
      const previous=region.scrollLeft
      for(const position of [0,region.scrollWidth]) {
        region.scrollLeft=position
        const expected=position===0?0:region.scrollWidth-region.clientWidth
        if(Math.abs(region.scrollLeft-expected)>1) issues.push("Table cannot scroll to its edge")
        for(const action of region.querySelectorAll(".uni-table-actions")) {
          const a=action.getBoundingClientRect()
          if(a.width && (a.left < r.left-1 || a.right > r.right+1)) issues.push("Table action inaccessible")
        }
      }
      region.scrollLeft=previous
      if(viewport<768 && [...region.querySelectorAll(".uni-table-key")].some(el=>getComputedStyle(el).position==="sticky")) {
        issues.push("Sticky identifying column covers mobile table")
      }
    }
    for(const el of document.querySelectorAll(".uni-dialog")) {
      const r=el.getBoundingClientRect()
      if(r.left < 0 || r.right > viewport+1 || r.top < 0 || r.bottom > innerHeight+1) issues.push("Dialog outside viewport")
    }
    return {width:viewport,documentWidth:document.documentElement.scrollWidth,issues}
  })
  const row = {engine: process.env.CURRENT_ENGINE, label, ...report}
  results.push(row)
  if(report.issues.length) {
    errors.push(row)
    await page.screenshot({path:"responsive-results/failure-"+errors.length+".png",fullPage:true})
    console.log("FAIL",label,JSON.stringify(report.issues))
  }
}
async function clickText(text, scope=".uni-main") {
  const button=page.locator(scope).getByRole("button",{name:text,exact:true}).first()
  await button.click()
  await settle()
}
async function dialogCheck(label) {
  await page.waitForSelector(".uni-dialog")
  await check(label)
  const scroll=page.locator(".uni-dialog-body, .uni-dialog-scroll").last()
  if(await scroll.count()) {
    await scroll.evaluate(el=>{el.scrollTop=el.scrollHeight})
    await check(label+" footer")
  }
  const close=page.locator(".uni-modal-overlay").getByRole("button",{name:"Fechar",exact:true}).first()
  if(await close.count()) await close.click()
  else await page.keyboard.press("Escape")
  await settle()
}
async function shellStates(label,width) {
  const shell = page.locator(".uni-shell")
  if(!await shell.count()) return check(label)
  for(const open of [true,false]) {
    const attr=width>=768?"data-sidebar-collapsed":"data-mobile-open"
    const value=await shell.getAttribute(attr)
    const current=width>=768?value!=="true":value==="true"
    if(current!==open) await page.locator(width>=768?".uni-desktop-toggle":".uni-mobile-toggle").click()
    await check(label+(open?" menu open":" menu collapsed"))
  }
}
try {
  for (const [engine, type] of [["chromium",chromium],["webkit",webkit]]) {
    process.env.CURRENT_ENGINE=engine
    browser=await type.launch({headless:true})
    page=await browser.newPage({deviceScaleFactor:1})
    const pageErrors=[]
    page.on("pageerror", e=>{pageErrors.push(e.message);console.log("BROWSER ERROR",e.message)})
    await page.goto(url)
    for(const [width,height] of sizes) {
      await page.setViewportSize({width,height})
      for(const name of names) {
        const before=pageErrors.length
        await page.evaluate(name=>window.renderFixture(name),name)
        await page.waitForFunction(name=>document.body.dataset.ready===name,name)
        await page.waitForSelector(name==="b2b"?".uni-main h1":name==="login"||name==="senha"||name==="setup"?"main":".uni-shell")
        await settle()
        assert.equal(pageErrors.length,before,"Render error on "+name)
        await shellStates(name+" "+width+"x"+height,width)
        if(name==="b2b") {
          // O bridge aciona os botões originais sem alterar o fluxo do CRM.
          for(const label of ["Painel","Minha carteira","De quem é?","Todas as empresas","Agenda","Funil","Convênios","Equipe e links"]) {
            await page.locator("nav ul button").filter({hasText:new RegExp("^"+label.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"$")}).evaluate(el=>el.click())
            await shellStates("B2B "+label+" "+width,width)
          }
          await clickText("Nova empresa")
          await dialogCheck("B2B form "+width)
          await page.locator("nav ul button").filter({hasText:"Todas as empresas"}).evaluate(el=>el.click())
          await page.locator(".uni-main tbody tr").first().click()
          await dialogCheck("B2B company "+width)
        }
        if(name==="escolas") { await clickText("Nova escola"); await dialogCheck("School form "+width) }
        if(name==="escola") {
          for(const text of ["Editar escola","Nova ação","Estimar","Novo"]) {
            await clickText(text); await dialogCheck("School "+text+" "+width)
          }
        }
        if(name==="atendimento") {
          for(const view of ["Mês","Lista","Semana"]) { await clickText(view); await check("Attendance "+view+" "+width) }
          for(const text of ["Novo compromisso","Configurar","Aplicar escala sugerida"]) {
            await clickText(text); await dialogCheck("Attendance "+text+" "+width)
          }
        }
        if(name==="metas") {
          await clickText("Nova meta"); await dialogCheck("Goal form "+width)
          await clickText("B2B · Ações semanais"); await check("Weekly goals "+width)
        }
        if(name==="supervest") { await clickText("Novo SuperVest"); await dialogCheck("SuperVest form "+width) }
        if(name==="usuarios") {
          await page.waitForSelector(".uni-main tbody button")
          await page.locator(".uni-main tbody").getByRole("button",{name:"Editar",exact:true}).first().click()
          await dialogCheck("User edit "+width)
        }
        if(name==="reunioes") {
          await clickText("Agendar reunião")
          await clickText("Adicionar participante +")
          await check("Company meeting form "+width)
        }
        if(width===1366 && ["dashboard","b2b","escola","atendimento"].includes(name)) {
          await page.screenshot({path:"responsive-results/"+engine+"-"+name+"-1366.png",fullPage:true})
        }
      }
    }
    // Reorganização ao redimensionar uma mesma tela sem recarregá-la.
    await page.evaluate(()=>window.renderFixture("b2b"))
    for(const [width,height]of [...sizes].reverse()) { await page.setViewportSize({width,height}); await shellStates("Live resize "+width,width) }
    await browser.close()
  }
} finally {
  await browser?.close()
  server.close()
  await fs.writeFile("responsive-results/results.json",JSON.stringify({checks:results.length,failures:errors.length,results},null,2))
  console.log("Responsive layout:",results.length,"checks,",errors.length,"failures")
}
assert.equal(errors.length,0,"Responsive layout failures")
