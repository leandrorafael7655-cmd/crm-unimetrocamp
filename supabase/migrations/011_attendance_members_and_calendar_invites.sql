-- UniConecta · membros do Atendimento e fila genérica de calendário.

create table if not exists public.attendance_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Compatibilidade com a primeira versão da fila de Atendimento.
create table if not exists public.attendance_invite_jobs (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.attendance_occurrences(id) on delete cascade,
  recipient_user_id uuid references public.profiles(id) on delete set null,
  operation text not null check (operation in ('REQUEST','CANCEL')),
  event_sequence integer not null check (event_sequence >= 0),
  idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending','processing','sent_provider','failed')),
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0 check (attempts >= 0),
  provider text,
  provider_message_id text,
  last_error text,
  next_attempt_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists attendance_invite_jobs_occurrence_idx on public.attendance_invite_jobs(occurrence_id);
create index if not exists attendance_invite_jobs_status_idx on public.attendance_invite_jobs(status,next_attempt_at,created_at);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('attendance','school_action','company_activity')),
  source_id uuid not null,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  event_uid text not null unique default (gen_random_uuid()::text || '@uniconecta'),
  sequence integer not null default 0 check (sequence >= 0),
  status text not null default 'active' check (status in ('active','cancelled')),
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null check (end_at > start_at),
  timezone text not null default 'America/Sao_Paulo',
  location text,
  description text,
  crm_path text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_type,source_id,recipient_user_id)
);
create index if not exists calendar_events_source_idx on public.calendar_events(source_type,source_id);
create index if not exists calendar_events_recipient_idx on public.calendar_events(recipient_user_id,start_at);

create table if not exists public.calendar_invite_jobs (
  id uuid primary key default gen_random_uuid(),
  calendar_event_id uuid not null references public.calendar_events(id) on delete cascade,
  operation text not null check (operation in ('REQUEST','CANCEL')),
  event_sequence integer not null check (event_sequence >= 0),
  idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending','processing','sent_provider','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  provider text,
  provider_message_id text,
  last_error text,
  next_attempt_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists calendar_invite_jobs_event_idx on public.calendar_invite_jobs(calendar_event_id);
create index if not exists calendar_invite_jobs_status_idx on public.calendar_invite_jobs(status,next_attempt_at,created_at);

-- updated_at dos membros/fila/eventos.
drop trigger if exists attendance_members_touch on public.attendance_members;
create trigger attendance_members_touch before update on public.attendance_members for each row execute function public.attendance_touch_updated_at();
drop trigger if exists attendance_invite_jobs_touch on public.attendance_invite_jobs;
create trigger attendance_invite_jobs_touch before update on public.attendance_invite_jobs for each row execute function public.attendance_touch_updated_at();
drop trigger if exists calendar_events_touch on public.calendar_events;
create trigger calendar_events_touch before update on public.calendar_events for each row execute function public.attendance_touch_updated_at();
drop trigger if exists calendar_invite_jobs_touch on public.calendar_invite_jobs;
create trigger calendar_invite_jobs_touch before update on public.calendar_invite_jobs for each row execute function public.attendance_touch_updated_at();

alter table public.attendance_members enable row level security;
alter table public.attendance_invite_jobs enable row level security;
alter table public.calendar_events enable row level security;
alter table public.calendar_invite_jobs enable row level security;

drop policy if exists attendance_members_read on public.attendance_members;
create policy attendance_members_read on public.attendance_members for select to authenticated using (true);
drop policy if exists attendance_members_manage on public.attendance_members;
create policy attendance_members_manage on public.attendance_members for all to authenticated using ((select public.is_manager())) with check ((select public.is_manager()));

drop policy if exists attendance_invite_jobs_read on public.attendance_invite_jobs;
create policy attendance_invite_jobs_read on public.attendance_invite_jobs for select to authenticated using ((select public.is_manager()) or recipient_user_id=(select auth.uid()));
drop policy if exists attendance_invite_jobs_manage on public.attendance_invite_jobs;
create policy attendance_invite_jobs_manage on public.attendance_invite_jobs for all to authenticated using ((select public.is_manager())) with check ((select public.is_manager()));

drop policy if exists calendar_events_read on public.calendar_events;
create policy calendar_events_read on public.calendar_events for select to authenticated using ((select public.is_manager()) or recipient_user_id=(select auth.uid()));
drop policy if exists calendar_events_manage on public.calendar_events;
create policy calendar_events_manage on public.calendar_events for all to authenticated using ((select public.is_manager())) with check ((select public.is_manager()));

drop policy if exists calendar_invite_jobs_read on public.calendar_invite_jobs;
create policy calendar_invite_jobs_read on public.calendar_invite_jobs for select to authenticated using (
  (select public.is_manager()) or exists (
    select 1 from public.calendar_events e
    where e.id = calendar_event_id and e.recipient_user_id = (select auth.uid())
  )
);
drop policy if exists calendar_invite_jobs_manage on public.calendar_invite_jobs;
create policy calendar_invite_jobs_manage on public.calendar_invite_jobs for all to authenticated using ((select public.is_manager())) with check ((select public.is_manager()));
