import { PGlite } from "@electric-sql/pglite"
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist"
import { readFileSync, readdirSync } from "node:fs"

const quote = (value: string) => '"' + value.replaceAll('"','""') + '"'
const schema = JSON.parse(readFileSync(new URL("../../tests/fixtures/audited-schema.json",import.meta.url),"utf8"))
const columns = JSON.parse(readFileSync(new URL("../../tests/fixtures/audited-column-grants.json",import.meta.url),"utf8"))
function grants(acl: string | null, object: string, kind: "table" | "function", column?: string) {
  const commands = [`revoke all on ${kind} ${object} from public,anon,authenticated,service_role;`]
  // PostgreSQL's default function ACL grants EXECUTE to PUBLIC.
  if (acl === null && kind === "function") commands.push(`grant execute on function ${object} to public;`)
  const types: Record<string,string> = {r:"select",a:"insert",w:"update",d:"delete",D:"truncate",x:"references",t:"trigger",X:"execute"}
  for (const match of (acl || "").matchAll(/(?:\{|,)([^=]*)=([^/]*)\//g)) {
    const role=match[1] || "public"
    if (!["public","anon","authenticated","service_role"].includes(role)) continue
    const privileges=[...match[2]].map(c=>types[c]).filter(Boolean)
    if (privileges.length) commands.push(`grant ${privileges.map(x=>column ? `${x} (${quote(column)})` : x).join(",")} on ${kind} ${object} to ${role};`)
  }
  return commands.join("\n")
}
export function auditedPublicSql() {
  const sql=["set check_function_bodies=off; create schema if not exists private; create schema if not exists extensions;"]
  for (const t of schema.tables.filter((t: any)=>!schema.views.some((v:any)=>v.schema===t.schema&&v.name===t.name))) {
    const fields=schema.columns.filter((c:any)=>c.schema===t.schema&&c.name===t.name).map((c:any)=>`${quote(c.column_name)} ${c.type}${c.identity_kind ? ` generated ${c.identity_kind==='a' ? 'always' : 'by default'} as identity` : c.default_expr ? ' default '+c.default_expr : ''}${c.not_null ? ' not null' : ''}`)
    sql.push(`create table ${quote(t.schema)}.${quote(t.name)} (${fields.join(',')});`)
  }
  for (const f of schema.functions) sql.push(f.definition+';')
  for (const c of schema.constraints.filter((c:any)=>c.contype!=="t" && c.contype!=="f")) sql.push(`alter table ${c.table_name} add constraint ${quote(c.name)} ${c.definition};`)
  for (const i of schema.indexes) sql.push(i.indexdef.replace(/CREATE (UNIQUE )?INDEX /,'CREATE $1INDEX IF NOT EXISTS ')+';')
  for (const c of schema.constraints.filter((c:any)=>c.contype==="f")) sql.push(`alter table ${c.table_name} add constraint ${quote(c.name)} ${c.definition};`)
  for (const v of schema.views) sql.push(`create view ${quote(v.schema)}.${quote(v.name)}${v.reloptions?.length ? ' with ('+v.reloptions.join(',')+')' : ''} as ${v.definition};`)
  for (const p of schema.policies) sql.push(`create policy ${quote(p.policyname)} on ${quote(p.schemaname)}.${quote(p.tablename)} as ${p.permissive} for ${p.cmd} to ${p.roles.join(',')}${p.qual ? ' using ('+p.qual+')' : ''}${p.with_check ? ' with check ('+p.with_check+')' : ''};`)
  for (const t of schema.triggers) sql.push(t.definition+';')
  sql.push('grant usage on schema public,private to anon,authenticated,service_role;')
  for (const t of schema.tables) {
    if (t.rls) sql.push(`alter table ${quote(t.schema)}.${quote(t.name)} enable row level security;`)
    sql.push(grants(t.acl,`${quote(t.schema)}.${quote(t.name)}`,'table'))
  }
  for (const c of columns) {
    // Column grants supplement table grants; they must not revoke other columns.
    sql.push(grants(c.acl,`${quote(c.schema)}.${quote(c.table)}`,'table',c.column).split('\n').slice(1).join('\n'))
  }
  for (const f of schema.functions) sql.push(grants(f.acl,f.signature,'function'))
  sql.push('set check_function_bodies=on;')
  return sql.join('\n')
}
export const TEST_USERS = {
  gerente:'10000000-0000-4000-8000-000000000001',gerente2:'10000000-0000-4000-8000-000000000002',
  supervisor:'10000000-0000-4000-8000-000000000003',b2b:'10000000-0000-4000-8000-000000000004',
  outro:'10000000-0000-4000-8000-000000000005',hs:'10000000-0000-4000-8000-000000000006',
}
export async function createAuditedDatabase(applyFixes=true) {
  const db=new PGlite({extensions:{btree_gist}})
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',encrypted_password text,deleted_at timestamptz,banned_until timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
    create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role')$$;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
    grant usage on schema auth to public; grant execute on all functions in schema auth to public;`)
  await db.exec(auditedPublicSql())
  for (const [role,id] of Object.entries(TEST_USERS)) {
    await db.query(`insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)`,[id,`${role}@example.invalid`,JSON.stringify({full_name:`Teste ${role}`,role:role==='outro'?'consultor_b2b':role})])
    await db.query(`update profiles set role=$2 where id=$1`,[id,role==='gerente2'?'gerente':role==='b2b'||role==='outro'?'consultor_b2b':role==='hs'?'high_school':role])
  }
  await db.exec(`insert into grade_levels(code,label,sort_order,active,supervest_eligible) values('em3','3ª série',3,true,true),('em2','2ª série',2,true,false);`)
  // Exercise permissive provider defaults; migrations must revoke broad grants explicitly.
  await db.exec(`alter default privileges in schema public grant all on tables to anon,authenticated,service_role;`)
  if(applyFixes) for(const f of readdirSync(new URL('../../supabase/migrations/',import.meta.url)).filter(f=>f.includes('_audit_')).sort()) {
    try {await db.exec(readFileSync(new URL('../../supabase/migrations/'+f,import.meta.url),'utf8'))}
    catch(error) {await db.close(); throw new Error('Migração '+f+': '+(error as Error).message)}
  }
  return db
}
export async function asUser(db:PGlite,id:string,role='authenticated') {
  await db.query(`select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false),set_config('request.jwt.claims',$3,false)`,[id,role,JSON.stringify({sub:id,role})])
  await db.exec(`set role ${role}`)
}
