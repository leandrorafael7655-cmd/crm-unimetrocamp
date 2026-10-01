import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { describe, expect, it } from "vitest"

describe("company action persistence and access control", () => {
  it("preserves legacy history, enforces manager/owner permissions and stamps the real author", async () => {
    const db = new PGlite()
    try {
      await db.exec(`
        create role anon; create role authenticated; create role service_role bypassrls;
        create schema auth;
        create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.user_id',true),'')::uuid$$;
        grant usage on schema public,auth to authenticated,anon,service_role;
        create table profiles(id uuid primary key,full_name text not null,consultant_tag text,role text not null,active boolean not null default true);
        create table companies(id uuid primary key,owner_id uuid references profiles);
        create table activities(id uuid primary key default gen_random_uuid(),company_id uuid references companies,observacao text);
        alter table profiles enable row level security;
        alter table companies enable row level security;
        create policy profiles_read on profiles for select to authenticated using(auth.uid() is not null);
        create policy companies_read on companies for select to authenticated using(auth.uid() is not null);
        grant select on profiles,companies to authenticated;
      `)
      await db.exec(readFileSync(new URL("../../supabase/migrations/20261001193302_company_action_history.sql", import.meta.url), "utf8"))
      const ids = Array.from({ length: 7 }, (_, i) => `10000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`)
      const [manager, owner, other, hs, inactive, supervisor, legacy] = ids
      for (const [id, role, active, tag] of [
        [manager, "gerente", true, "rafael-leandro"], [owner, "consultor_b2b", true, "junior-franca"],
        [other, "consultor_b2b", true, null], [hs, "high_school", true, null],
        [inactive, "gerente", false, null], [supervisor, "supervisor", true, null], [legacy, "consultor", true, null],
      ]) await db.query("insert into profiles values($1,'Nome completo',$2,$3,$4)", [id, tag, role, active])
      const company = "20000000-0000-0000-0000-000000000001", another = "20000000-0000-0000-0000-000000000002"
      await db.query("insert into companies values($1,$2),($3,$4)", [company, owner, another, legacy])
      await db.query("insert into activities(company_id,observacao) values($1,'Contato antigo')", [company])
      const asUser = async (id: string) => { await db.query("select set_config('request.user_id',$1,false)", [id]); await db.exec("set role authenticated") }
      const insert = (responsible = owner, companyId = company, kind = "presencial", id: string | null = null) => db.query(`
        insert into company_actions(id,company_id,action_type,title,occurred_at,responsible_user_id,description,location,channel,created_by,creator_name,responsible_name,created_at)
        values(coalesce($1::uuid,gen_random_uuid()),$2,$3,'Ação de teste','2026-09-28T17:30:00Z',$4,'Descrição',
          case when $3='presencial' then 'Sede' end,case when $3='online' then 'WhatsApp' end,$5,'Autor forjado','Consultor forjado','2000-01-01')
        returning id,created_by,creator_name,responsible_name,created_at`, [id, companyId, kind, responsible, other])
      await asUser(owner)
      const first = (await insert()).rows[0] as { id: string; created_by: string; creator_name: string; responsible_name: string; created_at: Date }
      expect(first.created_by).toBe(owner)
      expect(first.creator_name).toBe("Junior Franca")
      expect(first.responsible_name).toBe("Junior Franca")
      expect(new Date(first.created_at).getFullYear()).toBeGreaterThan(2020)
      await expect(insert(owner, another)).rejects.toThrow(/row-level security/)
      await expect(insert(other)).rejects.toThrow(/row-level security/)
      await expect(insert(owner, company, "presencial", first.id)).rejects.toThrow(/duplicate key/)
      await expect(db.query("update company_actions set description='Alterada' where id=$1", [first.id])).rejects.toThrow(/permission denied/)
      await expect(db.query("delete from company_actions where id=$1", [first.id])).rejects.toThrow(/permission denied/)
      await db.exec("reset role")
      await asUser(other)
      expect((await db.query("select id from company_actions")).rows).toHaveLength(1)
      await expect(insert(other)).rejects.toThrow(/row-level security/)
      await db.exec("reset role")
      await asUser(hs)
      expect((await db.query("select id from company_actions")).rows).toHaveLength(1)
      await expect(insert()).rejects.toThrow(/row-level security/)
      await db.exec("reset role")
      await asUser(manager)
      expect((await insert(other, another, "online")).rows[0]).toMatchObject({ created_by: manager, creator_name: "Rafael Leandro" })
      await expect(insert(inactive)).rejects.toThrow(/ativo/)
      await expect(insert(hs)).rejects.toThrow(/ativo/)
      await db.exec("reset role")
      await asUser(supervisor); await insert(owner); await db.exec("reset role")
      await asUser(legacy); await insert(legacy, another); await db.exec("reset role")
      await asUser(inactive)
      expect((await db.query("select id from company_actions")).rows).toEqual([])
      await expect(insert()).rejects.toThrow(/ativo/)
      await db.exec("reset role")
      await db.query("select set_config('request.user_id','',false)")
      await db.exec("set role anon")
      await expect(db.query("select * from company_actions")).rejects.toThrow(/permission denied/)
      await expect(insert()).rejects.toThrow(/permission denied/)
      await db.exec("reset role")
      expect((await db.query("select observacao from activities")).rows).toEqual([{ observacao: "Contato antigo" }])
      expect((await db.query("select id from company_actions")).rows).toHaveLength(4)
    } finally { await db.close() }
  }, 30000)
})
