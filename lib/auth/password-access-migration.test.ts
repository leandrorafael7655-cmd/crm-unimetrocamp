import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const manager = "10000000-0000-0000-0000-000000000001"
const collaborator = "10000000-0000-0000-0000-000000000002"
const supervisor = "10000000-0000-0000-0000-000000000003"
let db: PGlite
async function asUser(id: string) {
  await db.exec("reset role")
  await db.query("select set_config('request.user_id',$1,false)", [id])
  await db.exec("set role authenticated")
}
async function admin() { await db.exec("reset role") }

describe("Password rotation database protection", () => {
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      create role authenticated; create role anon; create role service_role bypassrls; create role authenticator;
      create schema auth; create schema private;
      grant usage on schema private,auth to authenticated,anon,service_role;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.user_id',true),'')::uuid$$;
      create function auth.role() returns text language sql as $$select 'authenticated'::text$$;
      create table public.profiles(id uuid primary key,full_name text,role text,active boolean default true);
      create table auth.users(id uuid primary key,encrypted_password text);
      create table public.companies(id int primary key,name text);
      alter table public.profiles enable row level security;
      alter table public.companies enable row level security;
      create policy profiles_all on public.profiles to authenticated using(true) with check(true);
      create policy companies_all on public.companies to authenticated using(true) with check(true);
      grant select,insert,update,delete on public.profiles,public.companies to authenticated;
      insert into public.profiles(id,full_name,role) values('${manager}','Gerente','gerente'),('${collaborator}','Teste','consultor_b2b'),('${supervisor}','Supervisor','supervisor');
      insert into auth.users values('${collaborator}','hash-inicial-simulado');
      insert into public.companies values(1,'Empresa de teste');
    `)
    await db.exec(readFileSync(new URL("../../supabase/migrations/20261002191852_user_password_access.sql", import.meta.url), "utf8"))
  })
  afterAll(async () => { await db.close() })

  it("preserves access for accounts without a temporary password", async () => {
    await asUser(collaborator)
    expect((await db.query("select * from companies")).rows).toHaveLength(1)
  })
  it("blocks direct data access and only exposes the user's profile during rotation", async () => {
    await admin()
    await db.query("update profiles set must_change_password=true where id=$1", [collaborator])
    await asUser(collaborator)
    expect((await db.query("select * from companies")).rows).toHaveLength(0)
    expect((await db.query<{ id: string }>("select id from profiles")).rows.map(x => x.id)).toEqual([collaborator])
    await expect(db.exec("insert into companies values(2,'Bloqueada')")).rejects.toThrow()
  })
  it("blocks the Data API including security definer RPCs", async () => {
    await asUser(collaborator)
    await db.exec("select set_config('request.path','rpc/sensitive_command',false); select set_config('request.method','POST',false)")
    await expect(db.exec("select private.check_password_rotation()")).rejects.toThrow(/Altere sua senha/)
    await db.exec("select set_config('request.path','/profiles',false); select set_config('request.method','GET',false)")
    await expect(db.exec("select private.check_password_rotation()")).resolves.toBeDefined()
    await db.exec("select set_config('request.method','PATCH',false)")
    await expect(db.exec("select private.check_password_rotation()")).rejects.toThrow(/Altere sua senha/)
  })
  it("does not release the gate on profile/metadata updates or a repeated hash", async () => {
    await admin()
    await db.query("update profiles set full_name='Teste alterado' where id=$1", [collaborator])
    await db.query("update auth.users set encrypted_password=encrypted_password where id=$1", [collaborator])
    expect((await db.query<{ must_change_password: boolean }>("select must_change_password from profiles where id=$1", [collaborator])).rows[0].must_change_password).toBe(true)
  })
  it("does not release the gate during the administrative provider operation", async () => {
    await admin()
    await db.query("update profiles set password_reset_pending=true where id=$1", [collaborator])
    await db.query("update auth.users set encrypted_password='hash-temporario-simulado' where id=$1", [collaborator])
    expect((await db.query<{ must_change_password: boolean }>("select must_change_password from profiles where id=$1", [collaborator])).rows[0].must_change_password).toBe(true)
    expect((await db.query("select * from user_access_history")).rows).toHaveLength(0)
    await db.query("update profiles set password_reset_pending=false where id=$1", [collaborator])
  })
  it("requires a real provider password change to release the gate and records self history", async () => {
    await admin()
    await db.query("update auth.users set encrypted_password='hash-pessoal-simulado' where id=$1", [collaborator])
    const profile = (await db.query<{ must_change_password: boolean; password_changed_at: string }>("select must_change_password,password_changed_at from profiles where id=$1", [collaborator])).rows[0]
    expect(profile.must_change_password).toBe(false)
    expect(profile.password_changed_at).toBeTruthy()
    const history = (await db.query<{ actor_id: string; target_id: string; action: string }>("select actor_id,target_id,action from user_access_history")).rows[0]
    expect(history).toMatchObject({ actor_id: collaborator, target_id: collaborator, action: "password_changed" })
    await asUser(collaborator)
    expect((await db.query("select * from companies")).rows).toHaveLength(1)
  })
  it("prevents even a manager from directly changing protected password state", async () => {
    await asUser(manager)
    await expect(db.query("update profiles set must_change_password=true where id=$1", [collaborator])).rejects.toThrow(/protegido/)
    await expect(db.query("update profiles set password_changed_at=now() where id=$1", [manager])).rejects.toThrow(/protegido/)
  })
  it("protects history from writes and restricts reads to Gerente Comercial", async () => {
    await asUser(supervisor)
    expect((await db.query("select * from user_access_history")).rows).toHaveLength(0)
    await expect(db.exec("delete from user_access_history")).rejects.toThrow()
    await asUser(collaborator)
    expect((await db.query("select * from user_access_history")).rows).toHaveLength(0)
    await asUser(manager)
    expect((await db.query("select * from user_access_history")).rows).toHaveLength(1)
    await expect(db.exec(`insert into user_access_history(actor_id,target_id,action,status) values('${manager}','${collaborator}','temporary_password','succeeded')`)).rejects.toThrow()
  })
})
