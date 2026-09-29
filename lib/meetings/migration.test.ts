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
      // Exercise the email extension against the same legacy + Graph database.
      await db.exec(`
        create table calendar_events(id uuid primary key);
        create table calendar_invite_jobs(id uuid primary key default gen_random_uuid(),calendar_event_id uuid not null references calendar_events,
          operation text not null,event_sequence integer not null,idempotency_key text unique not null,status text not null default 'pending',
          provider text,created_at timestamptz default now());
        alter table calendar_invite_jobs enable row level security;
        create policy legacy_jobs on calendar_invite_jobs for all to authenticated using(true) with check(true);
        grant all on calendar_invite_jobs to authenticated,service_role;
      `)
      await db.exec(readFileSync(new URL("../../supabase/migrations/20260929183658_b2b_email_calendar_invites.sql", import.meta.url), "utf8"))
      const emailId = "50000000-0000-0000-0000-000000000001"
      const emailPayload = { ...payload, calendar_provider: "email", meeting_type: "presencial", location: "Campus" }
      const emailStage = (revision: number, op: string, p: unknown) => db.query(
        "select (b2b_stage_meeting($1,$2,$3,$4,$5::jsonb)).id", [emailId,user,revision,op,JSON.stringify(p)])
      const queue = () => db.query("select b2b_queue_email_meeting($1,'agenda@example.com')", [emailId])
      const settle = () => db.query("select b2b_settle_email_meeting($1)", [emailId])
      const state = async () => (await db.query<{sync_status:string,status:string,calendar_uid:string}>(
        "select sync_status,status,calendar_uid from activities where id=$1",[emailId])).rows[0]
      await emailStage(0,"create",emailPayload)
      await queue(); await queue()
      let jobs = (await db.query<{payload:any,operation:string}>("select payload,operation from calendar_invite_jobs where meeting_activity_id=$1",[emailId])).rows
      expect(jobs).toHaveLength(3)
      expect(jobs.map(j=>j.payload.recipient.email).sort()).toEqual(["joao@example.com","maria@example.com","rafa@example.com"])
      expect(new Set(jobs.map(j=>j.payload.event_uid)).size).toBe(1)
      expect(jobs[0].payload.attendees).toHaveLength(3)
      const uid = (await state()).calendar_uid
      await settle(); expect((await state()).sync_status).toBe("pending")
      await db.query("update calendar_invite_jobs set status=case when payload->'recipient'->>'email'='maria@example.com' then 'failed' else 'sent_provider' end")
      await settle(); expect((await state()).sync_status).toBe("failed")
      await db.query("update calendar_invite_jobs set status='sent_provider' where status='failed'")
      await settle(); expect((await state()).sync_status).toBe("synced")
      await expect(emailStage(1,"update",{...emailPayload,calendar_provider:"graph"})).rejects.toThrow(/forma de envio/)
      await emailStage(1,"update",{...emailPayload, participants:[{name:"Carlos",email:"carlos@example.com"}],title:"Nova pauta"})
      await queue()
      jobs=(await db.query<{payload:any,operation:string}>("select payload,operation from calendar_invite_jobs where meeting_activity_id=$1 and event_sequence=2",[emailId])).rows
      expect(jobs).toHaveLength(4)
      expect(jobs.filter(j=>j.operation==="CANCEL").map(j=>j.payload.recipient.email)).toEqual(["maria@example.com"])
      expect(jobs.every(j=>j.payload.event_uid===uid)).toBe(true)
      expect(jobs.filter(j=>j.operation==="REQUEST").every(j=>j.payload.attendees.every((p:any)=>p.email!=="maria@example.com"))).toBe(true)
      await db.query("update calendar_invite_jobs set status='sent_provider'")
      await settle()
      await emailStage(2,"cancel",{})
      await queue()
      expect((await db.query("select id from calendar_invite_jobs where meeting_activity_id=$1 and operation='CANCEL' and event_sequence=3",[emailId])).rows).toHaveLength(3)
      await db.query("update calendar_invite_jobs set status='sent_provider'")
      await settle()
      expect(await state()).toMatchObject({status:"cancelada",sync_status:"synced",calendar_uid:uid})
      await db.exec("set role authenticated")
      await expect(queue()).rejects.toThrow(/permission denied/)
      expect((await db.query("update calendar_invite_jobs set status='pending' where meeting_activity_id=$1 returning id",[emailId])).rows).toEqual([])
      await db.exec("reset role")
      const unsentId = "60000000-0000-0000-0000-000000000001"
      await db.query("select b2b_stage_meeting($1,$2,0,'create',$3::jsonb)",[unsentId,user,JSON.stringify(emailPayload)])
      await db.query("select b2b_stage_meeting($1,$2,1,'cancel','{}'::jsonb)",[unsentId,user])
      expect((await db.query("select status,sync_status from activities where id=$1",[unsentId])).rows[0])
        .toEqual({status:"cancelada",sync_status:"synced"})
      expect((await db.query("select email from activity_participants where activity_id=$1",[unsentId])).rows)
        .toEqual([{email:"maria@example.com"}])
      expect((await db.query("select id from calendar_invite_jobs where meeting_activity_id=$1",[unsentId])).rows).toEqual([])
    } finally {
      await db.close()
    }
  }, 30000)
})
