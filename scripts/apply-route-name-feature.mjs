import fs from "node:fs"

function patchFile(path, patches) {
  let source = fs.readFileSync(path, "utf8")

  for (const { label, from, to } of patches) {
    if (source.includes(to)) continue
    if (!source.includes(from)) {
      throw new Error(`[route-name] Trecho não encontrado em ${path}: ${label}`)
    }
    source = source.replace(from, to)
  }

  fs.writeFileSync(path, source)
}

patchFile("components/routes/route-planner.tsx", [
  {
    label: "tipo PlanoResumo",
    from: `interface PlanoResumo {\n  id: string\n  plan_date: string\n  status: string\n  total_distance_m: number | null\n  total_duration_s: number | null\n}`,
    to: `interface PlanoResumo {\n  id: string\n  route_name: string | null\n  plan_date: string\n  status: string\n  total_distance_m: number | null\n  total_duration_s: number | null\n}`,
  },
  {
    label: "estado do nome",
    from: `  const [planDate, setPlanDate] = useState(() => new Date().toISOString().slice(0, 10))`,
    to: `  const [planDate, setPlanDate] = useState(() => new Date().toISOString().slice(0, 10))\n  const [routeName, setRouteName] = useState("")`,
  },
  {
    label: "validacao ao salvar",
    from: `  function salvar() {\n    if (selecionadas.length === 0) {\n      setAviso({ tipo: "erro", texto: "Nada para salvar." })\n      return\n    }\n    iniciarSalvar(async () => {`,
    to: `  function salvar() {\n    if (selecionadas.length === 0) {\n      setAviso({ tipo: "erro", texto: "Nada para salvar." })\n      return\n    }\n    if (!routeName.trim()) {\n      setAviso({ tipo: "erro", texto: "Dê um nome para a rota antes de salvar." })\n      return\n    }\n    iniciarSalvar(async () => {`,
  },
  {
    label: "nome no payload",
    from: `      const r = await salvarPlanoAction({\n        id: planoId,\n        plan_date: planDate,`,
    to: `      const r = await salvarPlanoAction({\n        id: planoId,\n        route_name: routeName.trim(),\n        plan_date: planDate,`,
  },
  {
    label: "nome ao reabrir",
    from: `      setPlanoId(r.id)\n      setPlanDate(r.plan_date)\n      setDeparture((r.departure_time ?? "08:00").slice(0, 5))`,
    to: `      setPlanoId(r.id)\n      setPlanDate(r.plan_date)\n      setRouteName(r.route_name ?? "")\n      setDeparture((r.departure_time ?? "08:00").slice(0, 5))`,
  },
  {
    label: "campo nome da rota",
    from: `          <div className="grid grid-cols-2 gap-3 text-sm">\n            <label className="flex flex-col gap-1">\n              <span className="text-xs text-muted-foreground">Data</span>`,
    to: `          <div className="grid grid-cols-2 gap-3 text-sm">\n            <label className="col-span-2 flex flex-col gap-1">\n              <span className="text-xs font-medium text-muted-foreground">Nome da rota</span>\n              <input\n                type="text"\n                maxLength={120}\n                value={routeName}\n                onChange={(e) => setRouteName(e.target.value)}\n                placeholder="Ex.: Rota Sumaré — Escolas"\n                className="rounded-md border border-border bg-background px-2 py-1.5"\n              />\n            </label>\n            <label className="flex flex-col gap-1">\n              <span className="text-xs text-muted-foreground">Data</span>`,
  },
  {
    label: "titulo da rota aberta",
    from: `            <h2 className="text-sm font-semibold">Rota ({selecionadas.length})</h2>`,
    to: `            <h2 className="min-w-0 truncate text-sm font-semibold">{routeName.trim() || "Nova rota"} <span className="font-normal text-muted-foreground">({selecionadas.length} paradas)</span></h2>`,
  },
  {
    label: "titulo rotas salvas",
    from: `<h2 className="text-sm font-semibold">Planos recentes</h2>`,
    to: `<h2 className="text-sm font-semibold">Rotas salvas</h2>`,
  },
  {
    label: "nome na lista de salvas",
    from: `                    <span className="font-medium text-foreground">{brData(p.plan_date)}</span>\n                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{p.status}</span>`,
    to: `                    <div className="min-w-0 flex-1">\n                      <p className="truncate font-medium text-foreground">{p.route_name || "Rota sem nome"}</p>\n                      <p className="text-xs text-muted-foreground">{brData(p.plan_date)}</p>\n                    </div>\n                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{p.status}</span>`,
  },
])

patchFile("app/actions/routes.ts", [
  {
    label: "campo route_name no payload",
    from: `export interface SalvarPlanoPayload {\n  id?: string | null\n  plan_date: string`,
    to: `export interface SalvarPlanoPayload {\n  id?: string | null\n  route_name?: string | null\n  plan_date: string`,
  },
  {
    label: "validacao server-side do nome",
    from: `    const actor = await requireCan("routes.plan")\n    const supabase = await createClient()\n\n    const base = {`,
    to: `    const actor = await requireCan("routes.plan")\n    const supabase = await createClient()\n    const routeName = payload.route_name?.trim() ?? ""\n    if (!routeName) return { ok: false, message: "Dê um nome para a rota antes de salvar." }\n    if (routeName.length > 120) return { ok: false, message: "O nome da rota deve ter no máximo 120 caracteres." }\n\n    const base = {\n      route_name: routeName,`,
  },
])

patchFile("lib/data/route-queries.ts", [
  {
    label: "route_name no PlanoCarregado",
    from: `export interface PlanoCarregado {\n  id: string\n  owner_id: string`,
    to: `export interface PlanoCarregado {\n  id: string\n  route_name: string | null\n  owner_id: string`,
  },
])

console.log("[route-name] feature patch aplicado")
