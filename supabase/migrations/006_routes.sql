-- 006_routes.sql — Fase 5 (Rotas)
-- Planos de rota diários por consultor e suas paradas (empresas e escolas misturadas).
-- RLS: cada usuário lê/escreve APENAS as próprias rotas; gerente e supervisor leem todas.

create table if not exists public.route_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  plan_date date not null,
  origin_label text,
  origin_lat double precision,
  origin_lng double precision,
  destination_label text,
  destination_lat double precision,
  destination_lng double precision,
  departure_time time,
  return_time time,
  avg_visit_minutes int not null default 45 check (avg_visit_minutes between 0 and 600),
  status text not null default 'rascunho' check (status in ('rascunho','otimizada','concluida','cancelada')),
  optimized_at timestamptz,
  total_distance_m int check (total_distance_m is null or total_distance_m >= 0),
  total_duration_s int check (total_duration_s is null or total_duration_s >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.route_stops (
  id uuid primary key default gen_random_uuid(),
  route_plan_id uuid not null references public.route_plans(id) on delete cascade,
  entity_type text not null check (entity_type in ('company','school')),
  entity_id uuid not null,
  sort_order int not null,
  fixed_time time,                    -- compromisso com hora marcada
  estimated_arrival time,             -- calculado pela otimização
  visit_minutes int check (visit_minutes is null or visit_minutes between 0 and 600),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_route_stops_plan on public.route_stops(route_plan_id, sort_order);
create index if not exists idx_route_plans_owner_date on public.route_plans(owner_id, plan_date desc);

-- updated_at automático em route_plans
create or replace function public.touch_route_plan_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_route_plans_touch on public.route_plans;
create trigger trg_route_plans_touch
  before update on public.route_plans
  for each row execute function public.touch_route_plan_updated_at();

-- ─────────────────────────  RLS  ─────────────────────────
alter table public.route_plans enable row level security;
alter table public.route_stops enable row level security;

-- route_plans: dono faz tudo com as próprias; gerência lê todas.
drop policy if exists route_plans_select on public.route_plans;
create policy route_plans_select on public.route_plans
  for select using (owner_id = auth.uid() or public.is_manager());

drop policy if exists route_plans_insert on public.route_plans;
create policy route_plans_insert on public.route_plans
  for insert with check (owner_id = auth.uid());

drop policy if exists route_plans_update on public.route_plans;
create policy route_plans_update on public.route_plans
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists route_plans_delete on public.route_plans;
create policy route_plans_delete on public.route_plans
  for delete using (owner_id = auth.uid());

-- route_stops: acesso derivado do dono do plano-pai; gerência lê todas.
drop policy if exists route_stops_select on public.route_stops;
create policy route_stops_select on public.route_stops
  for select using (
    exists (
      select 1 from public.route_plans p
      where p.id = route_stops.route_plan_id
        and (p.owner_id = auth.uid() or public.is_manager())
    )
  );

drop policy if exists route_stops_write on public.route_stops;
create policy route_stops_write on public.route_stops
  for all using (
    exists (
      select 1 from public.route_plans p
      where p.id = route_stops.route_plan_id and p.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.route_plans p
      where p.id = route_stops.route_plan_id and p.owner_id = auth.uid()
    )
  );
