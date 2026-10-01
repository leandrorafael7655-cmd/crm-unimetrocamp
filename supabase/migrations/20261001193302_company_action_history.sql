-- Completed B2B actions are kept separately from contact logs and calendar
-- meetings, then displayed together in the company timeline. Existing history
-- and invitation triggers are untouched.
create table public.company_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  action_type text not null check (action_type in ('presencial', 'online')),
  title text not null check (length(btrim(title)) between 1 and 160),
  occurred_at timestamptz not null check (isfinite(occurred_at)),
  responsible_user_id uuid references public.profiles(id) on delete set null,
  responsible_name text not null,
  description text not null check (length(btrim(description)) between 1 and 5000),
  result text check (length(result) <= 2000),
  notes text check (length(notes) <= 5000),
  location text check (length(location) <= 500),
  channel text check (length(channel) <= 100),
  promotion_url text check (length(promotion_url) <= 2048 and promotion_url ~* '^https?://[^[:space:]]+$'),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  creator_name text not null,
  created_at timestamptz not null default now(),
  constraint company_actions_type_fields check (
    (action_type = 'presencial' and length(btrim(location)) > 0 and location is not null and channel is null and promotion_url is null)
    or (action_type = 'online' and length(btrim(channel)) > 0 and channel is not null and location is null)
  )
);
create index company_actions_company_date_idx on public.company_actions(company_id, occurred_at desc, created_at desc);
create index company_actions_responsible_idx on public.company_actions(responsible_user_id);
create index company_actions_creator_idx on public.company_actions(created_by);

-- Derive audit identity and snapshot names from the authenticated database
-- session, never from editable client fields. Invoker permissions and RLS apply.
create function public.stamp_company_action() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  actor_tag text; actor_name text; responsible_tag text; responsible_full_name text;
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  select full_name, consultant_tag into actor_name, actor_tag
    from public.profiles where id = auth.uid() and active;
  select full_name, consultant_tag into responsible_full_name, responsible_tag
    from public.profiles where id = new.responsible_user_id and active
      and role in ('gerente','supervisor','consultor_b2b','consultor');
  if actor_name is null or responsible_full_name is null then
    raise exception 'Selecione um consultor B2B ativo.';
  end if;
  new.created_by := auth.uid();
  new.created_at := now();
  new.creator_name := case
    when nullif(btrim(actor_tag),'') is null then actor_name
    when actor_tag ~ '^[a-z0-9_-]+$' then initcap(regexp_replace(actor_tag,'[-_]+',' ','g'))
    else btrim(actor_tag) end;
  new.responsible_name := case
    when nullif(btrim(responsible_tag),'') is null then responsible_full_name
    when responsible_tag ~ '^[a-z0-9_-]+$' then initcap(regexp_replace(responsible_tag,'[-_]+',' ','g'))
    else btrim(responsible_tag) end;
  return new;
end;
$$;
revoke all on function public.stamp_company_action() from public, anon;
grant execute on function public.stamp_company_action() to authenticated;
create trigger company_actions_stamp before insert on public.company_actions
for each row execute function public.stamp_company_action();

alter table public.company_actions enable row level security;
revoke all on table public.company_actions from anon, authenticated;
grant select, insert on table public.company_actions to authenticated;
grant all on table public.company_actions to service_role;

create policy company_actions_read on public.company_actions for select to authenticated
using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active)
  and exists (select 1 from public.companies c where c.id = company_actions.company_id)
);
create policy company_actions_insert on public.company_actions for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.profiles actor
    where actor.id = (select auth.uid()) and actor.active
      and actor.role in ('gerente','supervisor','consultor_b2b','consultor')
      and exists (select 1 from public.companies c where c.id = company_actions.company_id
        and (actor.role in ('gerente','supervisor') or c.owner_id = actor.id))
      and (actor.role in ('gerente','supervisor') or responsible_user_id = actor.id)
  )
  and exists (select 1 from public.profiles p where p.id = responsible_user_id and p.active
    and p.role in ('gerente','supervisor','consultor_b2b','consultor'))
);
