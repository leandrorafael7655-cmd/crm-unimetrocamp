import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { describe, it, expect } from "vitest"

describe("persistência, auditoria e RLS da captação", () => {
  it("valida carteira compartilhada, isolamento por edição, transações e histórico", async () => {
    const db = new PGlite()
    const manager = "10000000-0000-0000-0000-000000000001",
      carla = "10000000-0000-0000-0000-000000000002",
      ramon = "10000000-0000-0000-0000-000000000003",
      inactive = "10000000-0000-0000-0000-000000000004"
    const school = "20000000-0000-0000-0000-000000000001",
      c27 = "30000000-0000-0000-0000-000000000001",
      c28 = "30000000-0000-0000-0000-000000000002",
      legacy = "40000000-0000-0000-0000-000000000001"
    try {
      await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
        create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.user_id',true),'')::uuid$$;
        grant usage on schema public,auth to anon,authenticated,service_role;
        create table profiles(id uuid primary key,full_name text,consultant_tag text,role text,active boolean default true);
        create table schools(id uuid primary key,name text,relationship_stage text default 'Mapeada',primary_owner_id uuid);
        create table grade_levels(code text primary key,label text,sort_order int,supervest_eligible boolean,active boolean default true);
        create table school_contacts(id uuid primary key,school_id uuid references schools,name text,role text);
        create table supervest_cycles(id uuid primary key,name text,status text,created_by uuid,campaign_start_at date,campaign_end_at date,updated_by uuid);
        create table school_actions(id uuid primary key default gen_random_uuid(),school_id uuid references schools,supervest_cycle_id uuid,action_date date,start_time time,end_time time,action_type text,objective text,status text check(status in ('agendada','confirmada','realizada','cancelada','reagendada')),primary_owner_id uuid,estimated_students int,estimated_classes int,notes text,result_notes text,created_by uuid,created_at timestamptz default now(),updated_at timestamptz default now());
        create table school_action_participants(school_action_id uuid references school_actions,user_id uuid references profiles,role_in_action text,primary key(school_action_id,user_id));
        create table school_action_grade_results(id uuid primary key default gen_random_uuid(),school_action_id uuid references school_actions,grade text references grade_levels,classes_count int,estimated_impacted int,leads int default 0,supervest_registrations int default 0,created_at timestamptz default now(),updated_at timestamptz default now());
        create function public.is_high_school_writer() returns boolean language sql stable set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and active and role in ('gerente','supervisor','high_school'))$$;
        create function public.is_manager() returns boolean language sql stable set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and active and role in ('gerente','supervisor'))$$;
        grant select on profiles,grade_levels,school_contacts to authenticated;
        grant select,insert,update,delete on schools,school_actions,school_action_participants,school_action_grade_results,supervest_cycles to authenticated;
        alter table schools enable row level security;alter table school_actions enable row level security;alter table school_action_participants enable row level security;alter table school_action_grade_results enable row level security;alter table supervest_cycles enable row level security;
        create policy schools_read on schools for select to authenticated using(auth.uid() is not null);create policy schools_write on schools for update to authenticated using(is_high_school_writer()) with check(is_high_school_writer());
        create policy sa_read on school_actions for select to authenticated using(auth.uid() is not null);create policy sa_insert on school_actions for insert to authenticated with check(is_high_school_writer());create policy sa_update on school_actions for update to authenticated using(is_high_school_writer());create policy sa_delete on school_actions for delete to authenticated using(is_manager());
        create policy sap_read on school_action_participants for select to authenticated using(auth.uid() is not null);create policy sap_write on school_action_participants for all to authenticated using(is_high_school_writer()) with check(is_high_school_writer());
        create policy sagr_read on school_action_grade_results for select to authenticated using(auth.uid() is not null);create policy sagr_write on school_action_grade_results for all to authenticated using(is_high_school_writer()) with check(is_high_school_writer());
        create policy cycles_read on supervest_cycles for select to authenticated using(auth.uid() is not null);create policy cycles_write on supervest_cycles for all to authenticated using(is_high_school_writer()) with check(is_high_school_writer());
        insert into profiles values('${manager}','Rafael Leandro','rafael-leandro','gerente',true),('${carla}','Carla','carla','consultor_b2b',true),('${ramon}','Ramon','ramon','consultor_b2b',true),('${inactive}','Inativo',null,'gerente',false);
        insert into schools values('${school}','Escola Mapeada','Mapeada',null);insert into grade_levels values('em3','3ª série EM',50,true,true);
        insert into supervest_cycles(id,name,status) values('${c27}','SuperVestibular 2027','captacao'),('${c28}','SuperVestibular 2028','planejamento');
        insert into school_actions(id,school_id,action_date,action_type,status,created_by) values('${legacy}','${school}','2026-09-25','Visita de relacionamento','agendada','${manager}');`)
      await db.exec(
        readFileSync(
          new URL(
            "../../supabase/migrations/20261002004704_school_capture_by_supervest_edition.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      )
      await db.query(
        "update schools set offered_grades=array['em3'] where id=$1",
        [school],
      )
      const asUser = async (id: string) => {
        await db.exec("reset role")
        await db.query("select set_config('request.user_id',$1,false)", [id])
        await db.exec("set role authenticated")
      }
      const save = async (
        command: string,
        payload: Record<string, unknown>,
        cycle = c27,
      ) =>
        (
          await db.query<{ r: { id: string } }>(
            "select public.save_school_capture($1,$2,$3,$4::jsonb) as r",
            [school, cycle, command, JSON.stringify(payload)],
          )
        ).rows[0].r
      const actionPayload = {
        action_date: "2026-10-24",
        start_time: "10:00",
        end_time: "11:00",
        action_type: "Divulgação SuperVestibular",
        objective: "Divulgação",
        status: "agendada",
        primary_user_id: carla,
        target_grades: ["em3"],
        support_ids: [ramon],
        location: "Escola",
        estimated_students: 40,
        estimated_classes: 1,
        notes: "Teste",
      }
      await asUser(carla)
      await save("start", { status: "em_negociacao", support_ids: [] })
      await asUser(ramon)
      await save("start", { status: "aguardando_retorno", support_ids: [] })
      expect(
        (
          await db.query(
            "select * from school_campaign_engagements where ended_at is null",
          )
        ).rows,
      ).toHaveLength(2)
      await asUser(carla)
      const engagement = (
        await db.query<{ id: string }>(
          "select id from school_campaign_engagements where user_id=$1",
          [carla],
        )
      ).rows[0]
      await save("close", { id: engagement.id })
      expect(
        (
          await db.query(
            "select user_id from school_campaign_engagements where ended_at is null",
          )
        ).rows,
      ).toEqual([{ user_id: ramon }])
      expect(
        (await db.query("select * from school_campaign_engagements")).rows,
      ).toHaveLength(2)
      const contactId = "50000000-0000-0000-0000-000000000001"
      const contact = {
        id: contactId,
        occurred_at: "2026-09-30T13:00:00Z",
        person_name: "Direção",
        channel: "WhatsApp",
        description: "Contato de campanha",
        status: "em_negociacao",
        support_ids: [ramon],
        next_step: "Retomar",
        return_at: "2026-10-01T12:00:00Z",
        consultant_id: manager,
        created_by: manager,
      }
      await save("contact", contact)
      await save("contact", contact)
      expect(
        (
          await db.query(
            "select consultant_id,consultant_name,created_by from school_campaign_contacts",
          )
        ).rows,
      ).toEqual([
        { consultant_id: carla, consultant_name: "Carla", created_by: carla },
      ])
      const first = (await save("action", actionPayload)).id
      expect(
        (
          await db.query(
            "select status,results_recorded_at from school_actions where id=$1",
            [first],
          )
        ).rows,
      ).toEqual([{ status: "agendada", results_recorded_at: null }])
      expect(
        (
          await db.query(
            "select user_name from school_action_participants where school_action_id=$1",
            [first],
          )
        ).rows,
      ).toEqual([{ user_name: "Ramon" }])
      await save("action", {
        ...actionPayload,
        id: first,
        action_date: "2026-09-30",
        status: "realizada",
      })
      await save("result", {
        id: first,
        results: [
          {
            grade: "em3",
            classes: 1,
            impacted: 0,
            leads: 0,
            pending: 0,
            registrations: 0,
          },
        ],
        notes: "Resultado zero informado",
      })
      expect(
        (
          await db.query(
            "select leads,supervest_registrations,pending_registrations from school_action_grade_results where school_action_id=$1",
            [first],
          )
        ).rows,
      ).toEqual([
        { leads: 0, supervest_registrations: 0, pending_registrations: 0 },
      ])
      const before = (
        await db.query("select * from school_actions where id=$1", [first])
      ).rows[0]
      const second = (
        await save(
          "action",
          { ...actionPayload, action_date: "2027-10-20" },
          c28,
        )
      ).id
      await save(
        "action",
        {
          ...actionPayload,
          id: second,
          action_date: "2027-10-21",
          status: "cancelada",
        },
        c28,
      )
      await expect(
        db.query(
          "update school_action_grade_results set school_action_id=$1 where school_action_id=$2",
          [second, first],
        ),
      ).rejects.toThrow(/transferido/)
      await expect(
        save("result", {
          id: first,
          results: [
            { grade: "em3", leads: 0, pending: 0, registrations: 0 },
            { grade: "em3", leads: 1, pending: 0, registrations: 0 },
          ],
        }),
      ).rejects.toThrow(/duas vezes/)
      expect(
        (await db.query("select * from school_actions where id=$1", [first]))
          .rows[0],
      ).toEqual(before)
      expect(
        (
          await db.query(
            "select * from school_campaign_contacts where supervest_cycle_id=$1",
            [c28],
          )
        ).rows,
      ).toHaveLength(0)
      expect(
        (
          await db.query(
            "select school_id,supervest_cycle_id from school_campaigns",
          )
        ).rows,
      ).toHaveLength(2)
      await expect(
        save("action", { ...actionPayload, id: first }, c28),
      ).rejects.toThrow(/escola\/edição/)
      await expect(
        db.query(
          "update school_actions set supervest_cycle_id=$1 where id=$2",
          [c28, first],
        ),
      ).rejects.toThrow(/transferida/)
      const count = (
        await db.query<{ n: number }>(
          "select count(*)::int n from school_actions",
        )
      ).rows[0].n
      await expect(
        save("action", { ...actionPayload, support_ids: [inactive] }),
      ).rejects.toThrow(/inativo/)
      expect(
        (
          await db.query<{ n: number }>(
            "select count(*)::int n from school_actions",
          )
        ).rows[0].n,
      ).toBe(count)
      expect(
        (
          await db.query(
            "update schools set offered_grades=array['em1'] where id=$1 returning id",
            [school],
          )
        ).rows,
      ).toHaveLength(0)
      await expect(
        db.query(
          "select configure_school_capture_cycle($1,2026,null,null,true)",
          [c27],
        ),
      ).rejects.toThrow(/permissão/)
      await expect(save("associate", { id: legacy })).rejects.toThrow(/gestão/)
      await expect(
        db.query(
          "insert into school_campaign_history(school_id,entity,operation,actor_name) values($1,'forjado','INSERT','Outro')",
          [school],
        ),
      ).rejects.toThrow(/permission denied/)
      await asUser(manager)
      expect(
        (
          await db.query(
            "select supervest_cycle_id from school_actions where id=$1",
            [legacy],
          )
        ).rows,
      ).toEqual([{ supervest_cycle_id: null }])
      await save("associate", { id: legacy, publicity: false })
      await expect(
        db.query("delete from school_actions where id=$1", [first]),
      ).rejects.toThrow(/cancele/)
      await expect(
        db.query(
          "delete from school_action_grade_results where school_action_id=$1",
          [first],
        ),
      ).rejects.toThrow(/corrija/)
      await db.query(
        "select configure_school_capture_cycle($1,2027,'2027-08-01','2027-10-20',true)",
        [c28],
      )
      expect(
        (await db.query("select id from supervest_cycles where is_active"))
          .rows,
      ).toEqual([{ id: c28 }])
      const audit = (
        await db.query<{ operation: string; actor_name: string }>(
          "select operation,actor_name from school_campaign_history",
        )
      ).rows
      expect(
        audit.some((h) => h.operation === "UPDATE" && h.actor_name === "Carla"),
      ).toBe(true)
      await asUser(inactive)
      expect(
        (await db.query("select * from school_campaign_contacts")).rows,
      ).toHaveLength(0)
      await expect(
        save("start", { status: "em_contato", support_ids: [] }),
      ).rejects.toThrow(/não autorizado/)
      await db.exec("reset role")
      await db.query("select set_config('request.user_id','',false)")
      await db.exec("set role anon")
      await expect(
        save("start", { status: "em_contato", support_ids: [] }),
      ).rejects.toThrow(/permission denied/)
      await expect(
        db.query("select * from school_campaign_history"),
      ).rejects.toThrow(/permission denied/)
    } finally {
      await db.close()
    }
  }, 60000)
})
