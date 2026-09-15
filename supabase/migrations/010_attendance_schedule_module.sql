-- UniConecta · Atendimento
-- Snapshot versionado do módulo de escala operacional aplicado em produção.
-- Início oficial da agenda: 26/10/2026.

create table if not exists public.attendance_settings (
  id smallint primary key default 1 check (id = 1),
  timezone text not null default 'America/Sao_Paulo',
  weekday_room_open time not null default '09:00',
  weekday_room_close time not null default '20:00',
  room_early_start time not null default '09:00',
  room_early_end time not null default '18:00',
  room_late_start time not null default '11:00',
  room_late_end time not null default '20:00',
  morning_start time not null default '09:00',
  morning_end time not null default '13:00',
  afternoon_start time not null default '14:00',
  afternoon_end time not null default '18:00',
  saturday_start time not null default '09:00',
  saturday_end time not null default '12:00',
  min_room_coverage integer not null default 2 check (min_room_coverage >= 1),
  room_location text not null default 'Sala de Matrícula · UniMetrocamp Wyden',
  conversion_location text not null default 'UniMetrocamp Wyden · Conversão',
  external_location text not null default 'Atividade externa',
  room_early_breaks jsonb not null default '[{"position":1,"start":"12:00","end":"13:00"},{"position":2,"start":"13:00","end":"14:00"}]'::jsonb,
  room_late_breaks jsonb not null default '[{"position":1,"start":"14:00","end":"15:00"},{"position":2,"start":"15:00","end":"16:00"}]'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  schedule_start_date date not null default '2026-10-26'
);

create table if not exists public.attendance_team_slots (
  slot_key text primary key,
  label text not null,
  sort_order integer not null,
  user_id uuid references public.profiles(id) on delete set null,
  active boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_rotation_template (
  week_index integer not null check (week_index between 1 and 4),
  lane text not null check (lane in ('room_early','room_late','conversion_am_external_pm','external_am_conversion_pm','saturday')),
  position integer not null check (position in (1,2)),
  slot_key text not null references public.attendance_team_slots(slot_key) on update cascade on delete restrict,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (week_index, lane, position)
);

create table if not exists public.attendance_cycles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cycle_start date not null,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  status text not null default 'draft' check (status in ('draft','published','cancelled')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_occurrences (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid references public.attendance_cycles(id) on delete set null,
  series_key text,
  template_week_index integer check (template_week_index between 1 and 4),
  slot_key text references public.attendance_team_slots(slot_key) on update cascade on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  activity text not null check (activity in ('room','conversion','external')),
  occurrence_date date not null,
  start_time time not null,
  end_time time not null check (end_time > start_time),
  break_start time,
  break_end time,
  location text,
  notes text,
  status text not null default 'draft' check (status in ('draft','published','cancelled')),
  event_uid text not null unique default (gen_random_uuid()::text || '@uniconecta'),
  sequence integer not null default 0 check (sequence >= 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete set null,
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (break_start is null and break_end is null)
    or
    (break_start is not null and break_end is not null and break_end > break_start and break_start >= start_time and break_end <= end_time)
  )
);

create index if not exists attendance_occurrences_cycle_idx on public.attendance_occurrences(cycle_id);
create index if not exists attendance_occurrences_date_idx on public.attendance_occurrences(occurrence_date);
create index if not exists attendance_occurrences_user_date_idx on public.attendance_occurrences(user_id, occurrence_date);

create table if not exists public.attendance_occurrence_history (
  id bigint generated by default as identity primary key,
  occurrence_id uuid not null,
  action text not null check (action in ('insert','update','delete','publish','cancel','reassign')),
  changed_by uuid references public.profiles(id) on delete set null,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_exceptions (
  exception_date date primary key,
  kind text not null default 'closed' check (kind in ('closed','holiday','custom')),
  closed boolean not null default true,
  note text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_absences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  absence_date date not null,
  start_time time,
  end_time time,
  reason text,
  active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((start_time is null and end_time is null) or (start_time is not null and end_time is not null and end_time > start_time))
);
create index if not exists attendance_absences_user_date_idx on public.attendance_absences(user_id, absence_date);

create or replace function public.attendance_touch_updated_at()
returns trigger
language plpgsql
set search_path = 'public', 'pg_catalog'
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.attendance_log_occurrence_change()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_catalog'
as $$
declare
  actor uuid := auth.uid();
  action_name text;
begin
  if tg_op = 'INSERT' then
    action_name := 'insert';
    insert into public.attendance_occurrence_history(occurrence_id, action, changed_by, new_values)
    values (new.id, action_name, coalesce(new.updated_by, new.created_by, actor), to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    action_name := case
      when old.user_id is distinct from new.user_id then 'reassign'
      when old.status <> 'published' and new.status = 'published' then 'publish'
      when old.status <> 'cancelled' and new.status = 'cancelled' then 'cancel'
      else 'update'
    end;
    insert into public.attendance_occurrence_history(occurrence_id, action, changed_by, old_values, new_values)
    values (new.id, action_name, coalesce(new.updated_by, actor), to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into public.attendance_occurrence_history(occurrence_id, action, changed_by, old_values)
    values (old.id, 'delete', actor, to_jsonb(old));
    return old;
  end if;
end;
$$;

-- updated_at
foreach_placeholder: -- marker replaced below conceptually; retained migrations use explicit triggers.

drop trigger if exists attendance_settings_touch on public.attendance_settings;
create trigger attendance_settings_touch before update on public.attendance_settings for each row execute function public.attendance_touch_updated_at();
drop trigger if exists attendance_team_slots_touch on public.attendance_team_slots;
create trigger attendance_team_slots_touch before update on public.attendance_team_slots for each row execute function public.attendance_touch_updated_at();
drop trigger if exists attendance_rotation_template_touch on public.attendance_rotation_template;
create trigger attendance_rotation_template_touch before update on public.attendance_rotation_template for each row execute function public.attendance_touch_updated_at();
drop trigger if exists attendance_cycles_touch on public.attendance_cycles;
create trigger attendance_cycles_touch before update on public.attendance_cycles for each row execute function public.attendance_touch_updated_at();
drop trigger if exists attendance_occurrences_touch on public.attendance_occurrences;
create trigger attendance_occurrences_touch before update on public.attendance_occurrences for each row execute function public.attendance_touch_updated_at();
drop trigger if exists attendance_exceptions_touch on public.attendance_exceptions;
create trigger attendance_exceptions_touch before update on public.attendance_exceptions for each row execute function public.attendance_touch_updated_at();
drop trigger if exists attendance_absences_touch on public.attendance_absences;
create trigger attendance_absences_touch before update on public.attendance_absences for each row execute function public.attendance_touch_updated_at();

drop trigger if exists attendance_occurrences_history on public.attendance_occurrences;
create trigger attendance_occurrences_history after insert or update or delete on public.attendance_occurrences for each row execute function public.attendance_log_occurrence_change();

-- Seed da configuração e das oito posições de referência.
insert into public.attendance_settings(id, schedule_start_date)
values (1, '2026-10-26')
on conflict (id) do update set schedule_start_date = excluded.schedule_start_date;

insert into public.attendance_team_slots(slot_key,label,sort_order,active) values
  ('junior','Junior',1,true),
  ('vanessa','Vanessa',2,true),
  ('madu','Madu',3,true),
  ('carla','Carla',4,true),
  ('adryeli','Adryeli',5,true),
  ('ramon','Ramon',6,true),
  ('consultor_7','Consultor 7',7,true),
  ('consultor_8','Consultor 8',8,true)
on conflict (slot_key) do update set label=excluded.label, sort_order=excluded.sort_order, active=excluded.active;

insert into public.attendance_rotation_template(week_index,lane,position,slot_key) values
  (1,'room_early',1,'junior'),(1,'room_early',2,'vanessa'),
  (1,'room_late',1,'madu'),(1,'room_late',2,'carla'),
  (1,'conversion_am_external_pm',1,'adryeli'),(1,'conversion_am_external_pm',2,'ramon'),
  (1,'external_am_conversion_pm',1,'consultor_7'),(1,'external_am_conversion_pm',2,'consultor_8'),
  (1,'saturday',1,'junior'),(1,'saturday',2,'vanessa'),
  (2,'room_early',1,'consultor_7'),(2,'room_early',2,'consultor_8'),
  (2,'room_late',1,'junior'),(2,'room_late',2,'vanessa'),
  (2,'conversion_am_external_pm',1,'madu'),(2,'conversion_am_external_pm',2,'carla'),
  (2,'external_am_conversion_pm',1,'adryeli'),(2,'external_am_conversion_pm',2,'ramon'),
  (2,'saturday',1,'madu'),(2,'saturday',2,'carla'),
  (3,'room_early',1,'adryeli'),(3,'room_early',2,'ramon'),
  (3,'room_late',1,'consultor_7'),(3,'room_late',2,'consultor_8'),
  (3,'conversion_am_external_pm',1,'junior'),(3,'conversion_am_external_pm',2,'vanessa'),
  (3,'external_am_conversion_pm',1,'madu'),(3,'external_am_conversion_pm',2,'carla'),
  (3,'saturday',1,'adryeli'),(3,'saturday',2,'ramon'),
  (4,'room_early',1,'madu'),(4,'room_early',2,'carla'),
  (4,'room_late',1,'adryeli'),(4,'room_late',2,'ramon'),
  (4,'conversion_am_external_pm',1,'consultor_7'),(4,'conversion_am_external_pm',2,'consultor_8'),
  (4,'external_am_conversion_pm',1,'junior'),(4,'external_am_conversion_pm',2,'vanessa'),
  (4,'saturday',1,'consultor_7'),(4,'saturday',2,'consultor_8')
on conflict (week_index,lane,position) do update set slot_key=excluded.slot_key;

-- RLS
alter table public.attendance_settings enable row level security;
alter table public.attendance_team_slots enable row level security;
alter table public.attendance_rotation_template enable row level security;
alter table public.attendance_cycles enable row level security;
alter table public.attendance_occurrences enable row level security;
alter table public.attendance_occurrence_history enable row level security;
alter table public.attendance_exceptions enable row level security;
alter table public.attendance_absences enable row level security;

drop policy if exists attendance_settings_read on public.attendance_settings;
create policy attendance_settings_read on public.attendance_settings for select to authenticated using (true);
drop policy if exists attendance_settings_manage on public.attendance_settings;
create policy attendance_settings_manage on public.attendance_settings for all to authenticated using ((select public.is_manager())) with check ((select public.is_manager()));

drop policy if exists attendance_team_slots_read on public.attendance_team_slots;
create policy attendance_team_slots_read on public.attendance_team_slots for select to authenticated using (true);
drop policy if exists attendance_team_slots_manage on public.attendance_team_slots;
create policy attendance_team_slots_manage on public.attendance_team_slots for all to authenticated using ((select public.is_manager())) with check ((select public.is_manager()));

drop policy if exists attendance_rotation_template_read on public.attendance_rotation_template;
create policy attendance_rotation_template_read on public.attendance_rotation_template for select to authenticated using (true);
drop policy if exists attendance_rotation_template_manage on public.attendance_rotation_template;
create policy attendance_rotation_template_manage on public.attendance_rotation_template for all to authenticated using ((select public.is_manager())) with check ((select public.is_manager()));

drop policy if exists attendance_cycles_manage_read on public.attendance_cycles;
create policy attendance_cycles_manage_read on public.attendance_cycles for select to authenticated using ((select public.is_manager()));
drop policy if exists attendance_cycles_manage_write on public.attendance_cycles;
create policy attendance_cycles_manage_write on public.attendance_cycles for all to authenticated using ((select public.is_manager())) with check ((select public.is_manager()));

drop policy if exists attendance_occurrences_read on public.attendance_occurrences;
create policy attendance_occurrences_read on public.attendance_occurrences for select to authenticated using ((select public.is_manager()) or (user_id=(select auth.uid()) and status in ('published','cancelled')));
drop policy if exists attendance_occurrences_manage on public.attendance_occurrences;
create policy attendance_occurrences_manage on public.attendance_occurrences for all to authenticated using ((select public.is_manager())) with check ((select public.is_manager()));

drop policy if exists attendance_history_read on public.attendance_occurrence_history;
create policy attendance_history_read on public.attendance_occurrence_history for select to authenticated using ((select public.is_manager()) or exists(select 1 from public.attendance_occurrences o where o.id=occurrence_id and o.user_id=(select auth.uid())));

drop policy if exists attendance_exceptions_read on public.attendance_exceptions;
create policy attendance_exceptions_read on public.attendance_exceptions for select to authenticated using (true);
drop policy if exists attendance_exceptions_manage on public.attendance_exceptions;
create policy attendance_exceptions_manage on public.attendance_exceptions for all to authenticated using ((select public.is_manager())) with check ((select public.is_manager()));

drop policy if exists attendance_absences_read on public.attendance_absences;
create policy attendance_absences_read on public.attendance_absences for select to authenticated using ((select public.is_manager()) or user_id=(select auth.uid()));
drop policy if exists attendance_absences_manage on public.attendance_absences;
create policy attendance_absences_manage on public.attendance_absences for all to authenticated using ((select public.is_manager())) with check ((select public.is_manager()));
