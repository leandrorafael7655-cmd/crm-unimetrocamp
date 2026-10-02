-- Passwords remain exclusively in Supabase Auth. These columns contain access state only.
grant usage on schema private to anon;
alter table public.profiles add column must_change_password boolean not null default false;
alter table public.profiles add column password_reset_pending boolean not null default false;
alter table public.profiles add column password_reset_operation uuid;
alter table public.profiles add column password_changed_at timestamptz;

create table public.user_access_history (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id),
  target_id uuid not null references public.profiles(id),
  action text not null check(action in ('recovery_email','temporary_password','password_changed')),
  status text not null check(status in ('pending','succeeded','failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index user_access_history_target_created on public.user_access_history(target_id,created_at desc);
create index user_access_history_actor on public.user_access_history(actor_id);
alter table public.user_access_history enable row level security;
revoke all on public.user_access_history from anon,authenticated;
grant select on public.user_access_history to authenticated;
grant select,insert,update on public.user_access_history to service_role;

create or replace function private.password_access_allowed() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.active and not p.must_change_password and not p.password_reset_pending);
$$;
revoke all on function private.password_access_allowed() from public,anon;
grant execute on function private.password_access_allowed() to authenticated;

create policy user_access_history_manager on public.user_access_history for select to authenticated
using ((select private.password_access_allowed()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='gerente' and p.active));

-- Direct REST writes cannot remove the mandatory password change, even by a manager.
create or replace function private.guard_password_state() returns trigger
language plpgsql set search_path='' as $$
begin
  if current_user in ('authenticated','anon') then
    if tg_op='INSERT' then
      if new.must_change_password or new.password_reset_pending or new.password_reset_operation is not null or new.password_changed_at is not null then
        raise insufficient_privilege using message='Estado de senha protegido pelo servidor.';
      end if;
    elsif new.must_change_password is distinct from old.must_change_password
       or new.password_reset_pending is distinct from old.password_reset_pending
       or new.password_reset_operation is distinct from old.password_reset_operation
       or new.password_changed_at is distinct from old.password_changed_at then
      raise insufficient_privilege using message='Estado de senha protegido pelo servidor.';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_password_state() from public,anon,authenticated;
create trigger guard_password_state before insert or update on public.profiles for each row execute function private.guard_password_state();

-- Only an actual Auth password change releases the gate. Admin operations set
-- pending before calling Auth, preventing intermediate provider updates from releasing it.
create or replace function private.on_auth_password_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password
     and coalesce(new.encrypted_password,'')<>''
     and exists(select 1 from public.profiles p where p.id=new.id and not p.password_reset_pending) then
    update public.profiles set must_change_password=false, password_reset_operation=null, password_changed_at=now() where id=new.id;
    insert into public.user_access_history(actor_id,target_id,action,status,completed_at)
      values(new.id,new.id,'password_changed','succeeded',now());
  end if;
  return new;
end $$;
revoke all on function private.on_auth_password_changed() from public,anon,authenticated;
create trigger uniconecta_password_changed after update of encrypted_password on auth.users for each row execute function private.on_auth_password_changed();

-- Restrictive policies preserve all existing scope rules and block direct REST/Realtime access.
do $$ declare t record;
begin
  for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind='r' and c.relrowsecurity
      and (n.nspname='public' or (n.nspname='storage' and c.relname in ('objects','buckets')))
      and c.relname<>'profiles'
  loop
    execute format('create policy password_rotation_gate on %I.%I as restrictive for all to authenticated using ((select private.password_access_allowed())) with check ((select private.password_access_allowed()))',t.nspname,t.relname);
  end loop;
end $$;
create policy password_rotation_profile_read on public.profiles as restrictive for select to authenticated
using (id=(select auth.uid()) or (select private.password_access_allowed()));
create policy password_rotation_profile_insert on public.profiles as restrictive for insert to authenticated
with check ((select private.password_access_allowed()));
create policy password_rotation_profile_update on public.profiles as restrictive for update to authenticated
using ((select private.password_access_allowed())) with check ((select private.password_access_allowed()));
create policy password_rotation_profile_delete on public.profiles as restrictive for delete to authenticated
using ((select private.password_access_allowed()));

-- SECURITY DEFINER RPCs bypass RLS. The pre-request check blocks them too.
create or replace function private.check_password_rotation() returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null and coalesce(auth.role(),'')<>'service_role'
     and exists(select 1 from public.profiles p where p.id=auth.uid() and (p.must_change_password or p.password_reset_pending)) then
    if trim(both '/' from coalesce(current_setting('request.path',true),''))='profiles'
       and current_setting('request.method',true) in ('GET','HEAD') then return; end if;
    raise insufficient_privilege using message='Altere sua senha temporária antes de acessar o CRM.';
  end if;
end $$;
revoke all on function private.check_password_rotation() from public;
grant execute on function private.check_password_rotation() to anon,authenticated,service_role;
alter role authenticator set pgrst.db_pre_request='private.check_password_rotation';
notify pgrst,'reload config';
