import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const manager = "10000000-0000-0000-0000-000000000001",
  joao = "10000000-0000-0000-0000-000000000002";
const maria = "10000000-0000-0000-0000-000000000003",
  pedro = "10000000-0000-0000-0000-000000000004";
const supervisor = "10000000-0000-0000-0000-000000000005",
  hs = "10000000-0000-0000-0000-000000000006";
let sequence = 0;
const id = () =>
  `20000000-0000-0000-0000-${String(++sequence).padStart(12, "0")}`;
let db: PGlite;
const asUser = async (user: string) => {
  await db.exec("reset role");
  await db.query("select set_config('request.user_id',$1,false)", [user]);
  await db.exec("set role authenticated");
};
const asAdmin = async () => {
  await db.exec("reset role");
  await db.query("select set_config('request.user_id',$1,false)", [manager]);
};
const company = async (owner: string | null = joao) => {
  await asUser(manager);
  const companyId = id();
  await db.query(
    "insert into companies(id,owner_id,razao_social,cidade) values($1,$2,'Empresa teste','Campinas')",
    [companyId, owner],
  );
  return companyId;
};
const command = async (cmd: string, payload: unknown) =>
  (
    await db.query<{ result: Record<string, unknown> }>(
      "select public.b2b_portfolio_command($1,$2::jsonb) result",
      [cmd, JSON.stringify(payload)],
    )
  ).rows[0].result;
const transfer = (companyId: string, from: string | null, to: string) =>
  command("transfer", {
    assignments: [{ companyId, expectedOwnerId: from, newOwnerId: to }],
    reason: "Redistribuição",
    notes: "Teste",
  });
const today = async () =>
  (
    await db.query<{ date: string }>(
      "select (now() at time zone 'America/Sao_Paulo')::date::text date",
    )
  ).rows[0].date;
const activity = async (
  companyId: string,
  type = "Visita",
  date?: string,
  status = "realizada",
) => {
  const day = date || (await today());
  return (
    await db.query<{ id: string }>(
      "insert into activities(company_id,tipo,data,status,observacao) values($1,$2,$3,$4,'Histórico preservado') returning id",
      [companyId, type, day, status],
    )
  ).rows[0].id;
};

describe("B2B portfolio database integration", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role authenticated;create role anon;create role service_role bypassrls;
      create schema auth;create schema private;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.user_id',true),'')::uuid$$;
      grant usage on schema public,auth,private to authenticated,anon,service_role;
      create table profiles(id uuid primary key,full_name text,consultant_tag text,role text,active boolean default true);
      create table companies(id uuid primary key,owner_id uuid references profiles,consultor text,razao_social text not null,nome_fantasia text,
        cidade text,segmento text,etapa text default 'Mapeada',proxima_acao text,data_proxima_acao date,next_action_location text,
        created_at timestamptz default now(),updated_at timestamptz default now());
      create table agreements(company_id uuid unique references companies,ativo boolean,status text);
      create table company_contacts(id uuid primary key default gen_random_uuid(),company_id uuid references companies,nome text);
      create table activities(id uuid primary key default gen_random_uuid(),company_id uuid references companies,primary_owner_id uuid references profiles,
        organizer_user_id uuid references profiles,consultor text,data date,tipo text,status text,observacao text,
        meeting_type text,end_at timestamptz,created_at timestamptz default now());
      create table app_settings(id int primary key);
      insert into app_settings values(1);
      create table commercial_cycles(id uuid primary key default gen_random_uuid(),name text,start_at date,end_at date,status text);
      create function public.is_manager() returns boolean language sql stable as $$select exists(select 1 from profiles where id=auth.uid() and active and role in('gerente','supervisor'))$$;
      alter table companies enable row level security;
      create policy companies_select on companies for select to authenticated using(auth.uid() is not null);
      create policy companies_insert on companies for insert to authenticated with check(public.is_manager() or owner_id=auth.uid());
      create policy companies_update on companies for update to authenticated using(public.is_manager() or owner_id=auth.uid());
      alter table activities enable row level security;
      create policy activities_read on activities for select to authenticated using(auth.uid() is not null);
      create policy activities_write on activities for insert to authenticated with check(public.is_manager() or exists(select 1 from companies where id=company_id and owner_id=auth.uid()));
      grant select,insert,update on companies,activities,profiles,app_settings,commercial_cycles to authenticated;
      grant select,insert,update on agreements,company_contacts to authenticated;
    `);
    await db.exec(
      readFileSync(
        new URL(
          "../../supabase/migrations/20261001193302_company_action_history.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      readFileSync(
        new URL(
          "../../supabase/migrations/20261002180014_b2b_portfolio_relationship.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    for (const [user, name, role] of [
      [manager, "Gerente", "gerente"],
      [joao, "João", "consultor_b2b"],
      [maria, "Maria", "consultor_b2b"],
      [pedro, "Pedro", "consultor_b2b"],
      [supervisor, "Supervisor", "supervisor"],
      [hs, "HS", "high_school"],
    ])
      await db.query(
        "insert into profiles(id,full_name,role) values($1,$2,$3)",
        [user, name, role],
      );
  }, 60000);
  afterAll(async () => {
    await db.close();
  });

  it("computes cycle boundaries across future years without manual records", async () => {
    await asUser(manager);
    for (const year of [2027, 2028, 2029, 2042, 2101]) {
      const code = String(year % 100).padStart(2, "0");
      for (const [date, number] of [
        [`${year}-01-15`, 1],
        [`${year}-04-30`, 1],
        [`${year}-05-01`, 2],
        [`${year}-07-15`, 2],
        [`${year}-09-30`, 2],
        [`${year - 1}-10-01`, 1],
      ] as const) {
        const result = (
          await db.query<{ cycle: Record<string, unknown> }>(
            "select b2b_commercial_cycle($1::date) cycle",
            [date],
          )
        ).rows[0].cycle;
        expect(result).toMatchObject({
          code: `${code}.${number}`,
          year,
          number,
          name: `${number}º Ciclo ${year}`,
          start: number === 1 ? `${year - 1}-10-01` : `${year}-05-01`,
          end: number === 1 ? `${year}-04-30` : `${year}-09-30`,
        });
      }
    }
    await db.query("select b2b_ensure_cycles()");
    const count = (await db.query("select count(*) n from commercial_cycles"))
      .rows[0];
    await db.query("select b2b_ensure_cycles()");
    expect(
      (await db.query("select count(*) n from commercial_cycles")).rows[0],
    ).toEqual(count);
    await expect(
      db.query(
        "insert into commercial_cycles(name,start_at,end_at,status) values('Errado','2027-01-01','2027-12-31','ativo')",
      ),
    ).rejects.toThrow(/automático/);
  });

  it("transfers an individual company and thirty companies atomically without losing history", async () => {
    const individual = await company();
    await asUser(joao);
    await activity(individual);
    await db.query(
      "insert into company_contacts(company_id,nome) values($1,'Contato original')",
      [individual],
    );
    await db.query("insert into agreements values($1,true,'Ativo')", [
      individual,
    ]);
    await asUser(manager);
    await transfer(individual, joao, maria);
    expect(
      (
        await db.query(
          "select owner_id,relationship_status from companies where id=$1",
          [individual],
        )
      ).rows[0],
    ).toMatchObject({ owner_id: maria, relationship_status: "active" });
    expect(
      (
        await db.query(
          "select observacao from activities where company_id=$1",
          [individual],
        )
      ).rows,
    ).toEqual([{ observacao: "Histórico preservado" }]);
    expect(
      (
        await db.query(
          "select count(*) n from company_contacts where company_id=$1",
          [individual],
        )
      ).rows[0],
    ).toEqual({ n: 1 });
    expect(
      (
        await db.query(
          "select ativo,status from agreements where company_id=$1",
          [individual],
        )
      ).rows[0],
    ).toEqual({ ativo: true, status: "Ativo" });
    const ids: string[] = [];
    for (let i = 0; i < 30; i++) ids.push(await company());
    await asUser(manager);
    const assignments = ids.map((companyId) => ({
      companyId,
      expectedOwnerId: joao,
      newOwnerId: maria,
    }));
    expect(
      await command("transfer", {
        assignments,
        reason: "Desligamento",
        notes: "Transferência de 30 empresas",
      }),
    ).toEqual({ count: 30 });
    expect(
      (
        await db.query(
          "select count(*) n from companies where id=any($1::uuid[]) and owner_id=$2",
          [ids, maria],
        )
      ).rows[0],
    ).toEqual({ n: 30 });
    expect(
      (
        await db.query(
          "select count(*) n from company_portfolio_history where company_id=any($1::uuid[]) and reason='Desligamento'",
          [ids],
        )
      ).rows[0],
    ).toEqual({ n: 30 });
    await expect(
      command("transfer", {
        assignments: [
          { companyId: ids[0], expectedOwnerId: maria, newOwnerId: pedro },
          { companyId: ids[1], expectedOwnerId: joao, newOwnerId: pedro },
        ],
        reason: "Outro",
      }),
    ).rejects.toThrow(/carteira mudou/);
    expect(
      (await db.query("select owner_id from companies where id=$1", [ids[0]]))
        .rows[0],
    ).toEqual({ owner_id: maria });
  }, 30000);

  it("separates agreements from cycle expiry and records an idempotent loss", async () => {
    const companyId = await company();
    await asUser(joao);
    await activity(companyId, "Visita", "2026-09-15");
    await db.query("insert into agreements values($1,true,'Ativo')", [
      companyId,
    ]);
    await asAdmin();
    await db.query("select private.b2b_review_companies('2027-04-30')");
    expect(
      (
        await db.query(
          "select relationship_status from companies where id=$1",
          [companyId],
        )
      ).rows[0],
    ).toEqual({ relationship_status: "active" });
    await db.query("select private.b2b_review_companies('2027-05-01')");
    expect(
      (
        await db.query(
          "select owner_id,relationship_status from companies where id=$1",
          [companyId],
        )
      ).rows[0],
    ).toEqual({ owner_id: joao, relationship_status: "inactive" });
    expect(
      (
        await db.query(
          "select ativo,status from agreements where company_id=$1",
          [companyId],
        )
      ).rows[0],
    ).toEqual({ ativo: true, status: "Ativo" });
    const history = (
      await db.query(
        "select count(*) n from company_portfolio_history where company_id=$1 and kind='relationship'",
        [companyId],
      )
    ).rows[0];
    await db.query("select private.b2b_review_companies('2027-05-01')");
    expect(
      (
        await db.query(
          "select count(*) n from company_portfolio_history where company_id=$1 and kind='relationship'",
          [companyId],
        )
      ).rows[0],
    ).toEqual(history);
  });

  it("blocks active-company requests, duplicate pending requests and stale approvals", async () => {
    const active = await company();
    await asUser(joao);
    await activity(active);
    await asUser(maria);
    await expect(
      command("request", { companyId: active, reason: "Possuo contato" }),
    ).rejects.toThrow(/em atendimento/);
    const inactive = await company();
    await asUser(maria);
    const request = await command("request", {
      companyId: inactive,
      reason: "Possuo contato",
      notes: "Oportunidade",
    });
    await asUser(pedro);
    await expect(
      command("request", { companyId: inactive, reason: "Outro" }),
    ).rejects.toThrow(/pendente/);
    expect(
      (
        await db.query(
          "select pending_request from b2b_company_portfolio where id=$1",
          [inactive],
        )
      ).rows[0],
    ).toEqual({ pending_request: true });
    expect(
      (
        await db.query(
          "select id from company_assignment_requests where company_id=$1",
          [inactive],
        )
      ).rows,
    ).toEqual([]);
    await asUser(manager);
    await transfer(inactive, joao, pedro);
    await expect(
      command("review_request", { id: request.id, status: "approved" }),
    ).rejects.toThrow(/carteira ou o relacionamento mudou/);
    expect(
      (await db.query("select owner_id from companies where id=$1", [inactive]))
        .rows[0],
    ).toEqual({ owner_id: pedro });
  });

  it("approves a request without inventing activity and reactivates only through a real owner action", async () => {
    const companyId = await company(null);
    await asUser(maria);
    const request = await command("request", {
      companyId,
      reason: "Empresa da minha região",
    });
    await asUser(manager);
    await command("review_request", {
      id: request.id,
      status: "approved",
      notes: "Aprovado pelo gerente",
    });
    expect(
      (
        await db.query(
          "select owner_id,relationship_status from companies where id=$1",
          [companyId],
        )
      ).rows[0],
    ).toEqual({ owner_id: maria, relationship_status: "inactive" });
    expect(
      (
        await db.query(
          "select count(*) n from activities where company_id=$1",
          [companyId],
        )
      ).rows[0],
    ).toEqual({ n: 0 });
    await asUser(maria);
    await activity(companyId, "Ação interna");
    await activity(companyId, "Ligação");
    await activity(companyId, "Reunião", undefined, "agendada");
    expect(
      (
        await db.query(
          "select relationship_status from companies where id=$1",
          [companyId],
        )
      ).rows[0],
    ).toEqual({ relationship_status: "inactive" });
    await db.query(
      "update companies set razao_social='Empresa editada' where id=$1",
      [companyId],
    );
    expect(
      (
        await db.query(
          "select relationship_status from companies where id=$1",
          [companyId],
        )
      ).rows[0],
    ).toEqual({ relationship_status: "inactive" });
    const actionId = await activity(companyId, "Reunião de relacionamento");
    expect(
      (
        await db.query(
          "select relationship_status from companies where id=$1",
          [companyId],
        )
      ).rows[0],
    ).toEqual({ relationship_status: "active" });
    const history = (
      await db.query<{
        new_value: { activity: { id: string; user_id: string } };
      }>(
        "select new_value from company_portfolio_history where company_id=$1 and kind='relationship'",
        [companyId],
      )
    ).rows[0];
    expect(history.new_value.activity).toMatchObject({
      id: actionId,
      user_id: maria,
    });
    await expect(
      db.query(
        "update companies set relationship_status='inactive' where id=$1",
        [companyId],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.query("update companies set owner_id=$1 where id=$2", [
        pedro,
        companyId,
      ]),
    ).rejects.toThrow(/Gerente Comercial/);
  });

  it("uses completed online/presencial history without promoting other participants to company owner", async () => {
    const companyId = await company();
    await asUser(manager);
    const save = (responsible: string, occurred = new Date().toISOString()) =>
      db.query(
        `insert into company_actions(company_id,action_type,title,occurred_at,responsible_user_id,description,channel)
      values($1,'online','[TESTE] Divulgação online',$2,$3,'Teste de integração','LinkedIn')`,
        [companyId, occurred, responsible],
      );
    await save(pedro);
    expect(
      (
        await db.query(
          "select owner_id,relationship_status from companies where id=$1",
          [companyId],
        )
      ).rows[0],
    ).toEqual({ owner_id: joao, relationship_status: "inactive" });
    await save(joao, new Date(Date.now() + 3600000).toISOString());
    expect(
      (
        await db.query(
          "select relationship_status from companies where id=$1",
          [companyId],
        )
      ).rows[0],
    ).toEqual({ relationship_status: "inactive" });
    await save(joao, new Date(Date.now() - 1000).toISOString());
    expect(
      (
        await db.query(
          "select owner_id,relationship_status from companies where id=$1",
          [companyId],
        )
      ).rows[0],
    ).toEqual({ owner_id: joao, relationship_status: "active" });
    expect(
      (
        await db.query(
          "select last_action_type,has_action_current_cycle from b2b_company_portfolio where id=$1",
          [companyId],
        )
      ).rows[0],
    ).toEqual({
      last_action_type: "Divulgação online",
      has_action_current_cycle: true,
    });
    await asUser(joao);
    await expect(
      db.query("update profiles set role='gerente' where id=$1", [joao]),
    ).rejects.toThrow(/Perfil de acesso/);
  });

  it("splits a departing consultant's portfolio across multiple destinations and preserves request refusal", async () => {
    const ids = [
      await company(),
      await company(),
      await company(),
      await company(),
    ];
    await asUser(manager);
    await command("transfer", {
      assignments: ids.map((companyId, i) => ({
        companyId,
        expectedOwnerId: joao,
        newOwnerId: i % 2 ? maria : pedro,
      })),
      reason: "Férias / afastamento",
    });
    const owners = (
      await db.query(
        "select owner_id,count(*) n from companies where id=any($1::uuid[]) group by owner_id order by owner_id",
        [ids],
      )
    ).rows;
    expect(owners).toEqual([
      { owner_id: maria, n: 2 },
      { owner_id: pedro, n: 2 },
    ]);
    const companyId = await company();
    await asUser(maria);
    const r = await command("request", { companyId, reason: "Outro" });
    await asUser(manager);
    await command("review_request", {
      id: r.id,
      status: "rejected",
      notes: "Sem aprovação neste momento",
    });
    expect(
      (
        await db.query(
          "select status,review_notes from company_assignment_requests where id=$1",
          [r.id],
        )
      ).rows[0],
    ).toEqual({
      status: "rejected",
      review_notes: "Sem aprovação neste momento",
    });
    expect(
      (
        await db.query("select owner_id from companies where id=$1", [
          companyId,
        ])
      ).rows[0],
    ).toEqual({ owner_id: joao });
  });

  it("limits management to gerente, permits own cancellation, preserves audit and protects departure", async () => {
    const companyId = await company();
    for (const user of [maria, supervisor, hs]) {
      await asUser(user);
      await expect(transfer(companyId, joao, maria)).rejects.toThrow(
        /Gerente Comercial|permissão/,
      );
    }
    await asUser(maria);
    const r = await command("request", { companyId, reason: "Outro" });
    await asUser(pedro);
    await expect(command("cancel_request", { id: r.id })).rejects.toThrow(
      /própria/,
    );
    await asUser(maria);
    await command("cancel_request", { id: r.id });
    expect(
      (
        await db.query(
          "select status from company_assignment_requests where id=$1",
          [r.id],
        )
      ).rows[0],
    ).toEqual({ status: "cancelled" });
    await expect(
      db.query("delete from company_portfolio_history where company_id=$1", [
        companyId,
      ]),
    ).rejects.toThrow(/permission denied/);
    await asUser(manager);
    await expect(
      db.query("update profiles set active=false where id=$1", [joao]),
    ).rejects.toThrow(/Redistribua/);
    await db.query("select b2b_review_portfolio()");
    const n = (
      await db.query("select count(*) n from company_portfolio_notifications")
    ).rows[0];
    await db.query("select b2b_review_portfolio()");
    expect(
      (await db.query("select count(*) n from company_portfolio_notifications"))
        .rows[0],
    ).toEqual(n);
    await asUser(supervisor);
    await expect(
      db.query("update app_settings set b2b_risk_days=40 where id=1"),
    ).rejects.toThrow(/Gerente Comercial/);
    await asAdmin();
    await db.query("select set_config('request.user_id','',false)");
    await db.exec("set role anon");
    await expect(
      db.query("select b2b_portfolio_command('transfer','{}')"),
    ).rejects.toThrow(/permission denied/);
  });
});
