begin;
-- Preserve display formatting and history; uniqueness uses a canonical identifier.
create function public.canonical_cnpj(value text) returns text language sql immutable strict set search_path='' as $$
  select nullif(regexp_replace(upper(value),'[./[:space:]-]','','g'),'')
$$;
revoke all on function public.canonical_cnpj(text) from public,anon;
grant execute on function public.canonical_cnpj(text) to authenticated,service_role;
create function public.valid_cnpj(value text) returns boolean language plpgsql immutable set search_path='' as $$
declare c text:=public.canonical_cnpj(value); total integer; digit integer; i integer; weights integer[];
begin
  if c is null then return true; end if;
  if c !~ '^[A-Z0-9]{12}[0-9]{2}$' or c ~ '^([0-9])\1{13}$' then return false; end if;
  weights:=array[5,4,3,2,9,8,7,6,5,4,3,2]; total:=0;
  for i in 1..12 loop total:=total+(ascii(substr(c,i,1))-48)*weights[i]; end loop;
  digit:=case when total%11<2 then 0 else 11-total%11 end;
  if substr(c,13,1)<>digit::text then return false; end if;
  weights:=array[6,5,4,3,2,9,8,7,6,5,4,3,2]; total:=0;
  for i in 1..13 loop total:=total+(ascii(substr(c,i,1))-48)*weights[i]; end loop;
  digit:=case when total%11<2 then 0 else 11-total%11 end;
  return substr(c,14,1)=digit::text;
end $$;
revoke all on function public.valid_cnpj(text) from public,anon;
grant execute on function public.valid_cnpj(text) to authenticated,service_role;
-- The preflight must resolve canonical duplicates first; this migration never merges/deletes data.
create unique index companies_canonical_cnpj on public.companies(public.canonical_cnpj(cnpj)) where public.canonical_cnpj(cnpj) is not null;
create unique index schools_canonical_cnpj on public.schools(public.canonical_cnpj(cnpj)) where public.canonical_cnpj(cnpj) is not null;
alter table public.companies add constraint company_cnpj_valid check(public.valid_cnpj(cnpj)) not valid;
alter table public.schools add constraint school_cnpj_valid check(public.valid_cnpj(cnpj)) not valid;
alter table public.school_actions add constraint school_action_valid_interval check(
  (start_time is null and end_time is null) or
  (start_time is not null and end_time is not null and end_time>start_time and end_time<'24:00'::time)) not valid;
alter table public.route_plans add constraint route_plan_valid_interval check(
  (departure_time is null and return_time is null) or
  (departure_time is not null and return_time is not null and return_time>departure_time and return_time<'24:00'::time)) not valid;

-- Reservation projection, independent of invite delivery. The exclusion constraint
-- protects principal AND support against concurrent school double-booking.
create extension if not exists btree_gist with schema extensions;
create table private.school_calendar_reservations(
  action_id uuid not null references public.school_actions(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  period tsrange not null,
  primary key(action_id,user_id),
  exclude using gist(user_id with =,period with &&)
);
alter table private.school_calendar_reservations enable row level security;
revoke all on private.school_calendar_reservations from public,anon,authenticated;
grant all on private.school_calendar_reservations to service_role;
create function private.sync_school_reservations() returns trigger
language plpgsql security definer set search_path='' as $$
declare target_action uuid; action_row public.school_actions%rowtype;
begin
  if tg_table_name='school_actions' then target_action:=coalesce(new.id,old.id);
  else target_action:=coalesce(new.school_action_id,old.school_action_id); end if;
  select * into action_row from public.school_actions where id=target_action;
  delete from private.school_calendar_reservations r where r.action_id=target_action;
  if action_row.id is not null and action_row.status in ('agendada','confirmada','reagendada')
      and action_row.start_time is not null and action_row.end_time>action_row.start_time then
    insert into private.school_calendar_reservations(action_id,user_id,period)
    select target_action,user_id,tsrange(action_row.action_date+action_row.start_time,action_row.action_date+action_row.end_time,'[)')
    from (select action_row.primary_owner_id as user_id union select p.user_id from public.school_action_participants p where p.school_action_id=target_action) people
    where user_id is not null;
  end if;
  return null;
end $$;
revoke all on function private.sync_school_reservations() from public,anon,authenticated;
create constraint trigger school_reservation_action after insert or update or delete on public.school_actions
  deferrable initially deferred for each row execute function private.sync_school_reservations();
create constraint trigger school_reservation_people after insert or update or delete on public.school_action_participants
  deferrable initially deferred for each row execute function private.sync_school_reservations();
insert into private.school_calendar_reservations(action_id,user_id,period)
select distinct a.id,u.user_id,tsrange(a.action_date+a.start_time,a.action_date+a.end_time,'[)')
from public.school_actions a cross join lateral(
  select a.primary_owner_id as user_id union select p.user_id from public.school_action_participants p where p.school_action_id=a.id
) u where u.user_id is not null and a.status in ('agendada','confirmada','reagendada') and a.start_time is not null and a.end_time>a.start_time;

-- Remove the confirmed duplicate index, preserving the equivalent uniqueness constraint/index.
drop index if exists public.school_action_one_grade_result;
commit;
