import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { describe, expect, it } from "vitest"

describe("B2B migration and database invariants", () => {
  it("keeps stable contacts, one principal, meeting identity, history and server-only writes", async () => {
    const db = new PGlite()
    try {
      await db.exec(`
        create role anon; create role authenticated; create role service_role bypassrls;
        create schema auth;
        create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.user_id',true),'')::uuid$$;
        grant usage on schema public,auth to authenticated,service_role;
        create table profiles(id uuid primary key,active boolean not null default true);
        create table companies(id uuid primary key,owner_id uuid references profiles);
        create table company_contacts(id uuid primary key default gen_random_uuid(),company_id uuid references companies on delete cascade,nome text not null,cargo text,email text,telefone text,updated_at timestamptz default now());
        create table activities(id uuid primary key default gen_random_uuid(),company_id uuid references companies on delete cascade,consultor text,primary_owner_id uuid references profiles,data date not null,tipo text,contato text,observacao text,status text not null default 'realizada',conta_meta_semanal boolean not null default true,created_at timestamptz default now(),updated_at timestamptz default now());
        alter table activities enable row level security;
        create policy legacy_read on activities for select to authenticated using(true);
        create policy legacy_write on activities for all to authenticated using(true) with check(true);
        grant all on profiles,companies,company_contacts,activities to service_role;
        grant select on profiles,companies,company_contacts to authenticated;
        grant all on activities to authenticated;
      `)
      await db.exec(
        readFileSync(
          new URL("../../supabase/migrations/20260929171405_b2b_outlook_teams.sql", import.meta.url),
          "utf8",
        ),
      )
      const user = "10000000-0000-0000-0000-000000000001",
        company = "20000000-0000-0000-0000-000000000001",
        id = "30000000-0000-0000-0000-000000000001",
        lock = "40000000-0000-0000-0000-000000000001"
      await db.query("insert into profiles(id) values($1)", [user])
      await db.query("insert into companies(id,owner_id) values($1,$2)", [company, user])
      const saveContact = async (contact: Record<string, unknown>, contactId: string | null = null) => {
        const result = await db.query<{ id: string }>("select b2b_save_contact($1,$2,$3::jsonb) id", [
          company,
          contactId,
          JSON.stringify(contact),
        ])
        return result.rows[0].id
      }
      const main = await saveContact({ nome: "João", email: "joao@example.com", is_primary: true })
      const other = await saveContact({ nome: "Maria", email: "maria@example.com", is_primary: true })
      expect((await db.query("select id from company_contacts where is_primary")).rows).toEqual([
        { id: other },
      ])
      expect(
        await saveContact({ nome: "João editado", email: "joao@example.com", is_primary: true }, main),
      ).toBe(main)
      expect((await db.query("select id from company_contacts where is_primary")).rows).toEqual([
        { id: main },
      ])
      const payload = {
        company_id: company,
        company_name: "Empresa",
        contact_id: main,
        contact_name: "João",
        contact_email: "joao@example.com",
        organizer_name: "Rafa",
        organizer_email: "rafa@example.com",
        date: "2027-02-20",
        meeting_type: "teams",
        title: "Parceria",
        description: "Pauta",
        start_at: "2027-02-20T17:00:00Z",
        end_at: "2027-02-20T18:00:00Z",
        location: "",
        participants: [{ name: "Maria", email: "maria@example.com" }],
      }
      const stage = (revision: number, operation: string, p: unknown) =>
        db.query("select (b2b_stage_meeting($1,$2,$3,$4,$5::jsonb)).id", [
          id,
          user,
          revision,
          operation,
          JSON.stringify(p),
        ])
      await stage(0, "create", payload)
      await stage(0, "create", payload)
      expect((await db.query("select id from activities")).rows).toHaveLength(1)
      await db.query("update activities set sync_status='syncing',sync_lock=$1 where id=$2", [lock, id])
      const finish = () =>
        db.query("select b2b_finish_meeting($1,$2,$3::jsonb)", [
          id,
          lock,
          JSON.stringify({
            id: "outlook-original",
            changeKey: "1",
            onlineMeeting: { joinUrl: "https://teams.microsoft.com/mock" },
          }),
        ])
      await finish()
      expect((await db.query("select email from activity_participants")).rows).toEqual([
        { email: "maria@example.com" },
      ])
      await expect(stage(0, "update", payload)).rejects.toThrow(/alterada/)
      await stage(1, "update", { ...payload, participants: [] })
      await db.query("update activities set sync_status='syncing',sync_lock=$1 where id=$2", [lock, id])
      await finish()
      expect((await db.query("select email from activity_participants")).rows).toEqual([])
      expect((await db.query("select outlook_event_id from activities")).rows).toEqual([
        { outlook_event_id: "outlook-original" },
      ])
      await expect(db.query("delete from company_contacts where id=$1", [main])).rejects.toThrow(
        /foreign key/,
      )
      await db.query("select set_config('request.user_id',$1,false)", [user])
      await db.exec("set role authenticated")
      await expect(db.query("select * from microsoft_calendar_accounts")).rejects.toThrow(/permission denied/)
      await expect(stage(2, "cancel", {})).rejects.toThrow(/permission denied/)
      expect(
        (await db.query("update activities set title='tampered' where id=$1 returning id", [id])).rows,
      ).toEqual([])
      expect((await db.query("delete from activities where id=$1 returning id", [id])).rows).toEqual([])
      await db.exec("reset role")
      await stage(2, "cancel", {})
      await db.query("update activities set sync_status='syncing',sync_lock=$1 where id=$2", [lock, id])
      await finish()
      expect((await db.query("select status,outlook_event_id from activities")).rows).toEqual([
        { status: "cancelada", outlook_event_id: "outlook-original" },
      ])
      await expect(db.query("delete from activities where id=$1", [id])).rejects.toThrow(/histórico/)
    } finally {
      await db.close()
    }
  }, 30000)
})
