import fs from "node:fs"

function apply(path, patches) {
  let source = fs.readFileSync(path, "utf8")
  let changed = false

  for (const { from, to, label } of patches) {
    if (source.includes(to)) continue
    if (!source.includes(from)) {
      throw new Error(`[operational-name] patch não encontrado em ${path}: ${label}`)
    }
    source = source.replace(from, to)
    changed = true
  }

  if (changed) fs.writeFileSync(path, source)
}

apply("lib/data/goals-queries.ts", [
  {
    label: "import helper",
    from: 'import { createClient } from "@/lib/supabase/server"\n',
    to: 'import { createClient } from "@/lib/supabase/server"\nimport { profileDisplayName } from "@/lib/domain/user-display"\n',
  },
  {
    label: "goal profile tag",
    from: '"goal_types(label,unit),profiles!goals_user_id_fkey(full_name)",',
    to: '"goal_types(label,unit),profiles!goals_user_id_fkey(full_name,consultant_tag)",',
  },
  {
    label: "goal user name",
    from: 'userName: g.profiles?.full_name ?? null,',
    to: 'userName: g.profiles ? profileDisplayName(g.profiles, "") || null : null,',
  },
  {
    label: "goal history profile tag",
    from: '.select("id,field_changed,previous_value,new_value,reason,changed_at,profiles(full_name)")',
    to: '.select("id,field_changed,previous_value,new_value,reason,changed_at,profiles(full_name,consultant_tag)")',
  },
  {
    label: "goal history user name",
    from: 'changedByName: h.profiles?.full_name ?? null,',
    to: 'changedByName: h.profiles ? profileDisplayName(h.profiles, "") || null : null,',
  },
])

apply("app/actions/attendance.ts", [
  {
    label: "attendance helper import",
    from: 'import { can } from "@/lib/domain/roles"\n',
    to: 'import { can } from "@/lib/domain/roles"\nimport { profileDisplayName } from "@/lib/domain/user-display"\n',
  },
  {
    label: "attendance profile tag",
    from: 'admin.from("profiles").select("id,full_name,email,role,active").eq("active", true).order("full_name"),',
    to: 'admin.from("profiles").select("id,full_name,consultant_tag,email,role,active").eq("active", true).order("full_name"),',
  },
  {
    label: "attendance operational profiles",
    from: 'const profiles = profilesRes.data ?? []',
    to: 'const profiles = (profilesRes.data ?? []).map((p: any) => ({ ...p, legal_full_name: p.full_name, full_name: profileDisplayName(p) }))',
  },
])

apply("app/actions/user-admin.ts", [
  {
    label: "managed user helper import",
    from: 'import { authRedirectUrl, siteUrl } from "@/lib/auth/urls"\n',
    to: 'import { authRedirectUrl, siteUrl } from "@/lib/auth/urls"\nimport { profileDisplayName } from "@/lib/domain/user-display"\n',
  },
  {
    label: "managed user display type",
    from: '  full_name: string\n  email: string',
    to: '  full_name: string\n  display_name: string\n  email: string',
  },
  {
    label: "managed user display value",
    from: '        full_name: p?.full_name || meta.full_name || u.email?.split("@")[0] || "Sem nome",\n        email:',
    to: '        full_name: p?.full_name || meta.full_name || u.email?.split("@")[0] || "Sem nome",\n        display_name: profileDisplayName({ full_name: p?.full_name || meta.full_name, consultant_tag: p?.consultant_tag || meta.consultant_tag }, u.email?.split("@")[0] || "Sem nome"),\n        email:',
  },
  {
    label: "managed user operational sort",
    from: '.sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR"))',
    to: '.sort((a, b) => a.display_name.localeCompare(b.display_name, "pt-BR"))',
  },
])

apply("components/team/gerenciar-usuarios.tsx", [
  {
    label: "delete confirmation operational name",
    from: '`Excluir ${u.full_name} (${u.email})?',
    to: '`Excluir ${u.display_name} (${u.email})?',
  },
  {
    label: "managed user table operational name",
    from: '<div className="text-slate-900">{u.full_name}</div>\n                    <div className="font-mono text-[11px] text-slate-400">{u.email}</div>',
    to: '<div className="font-medium text-slate-900">{u.display_name}</div>\n                    {u.full_name !== u.display_name && <div className="text-[11px] text-slate-500">{u.full_name}</div>}\n                    <div className="font-mono text-[11px] text-slate-400">{u.email}</div>',
  },
])

console.log("[operational-name] patches aplicados")
