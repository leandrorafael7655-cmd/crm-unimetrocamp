-- SEC-01 / ACCESS-01 / ACCESS-02. No existing account is promoted or disabled.
-- Auth signup configuration is an environment setting: see docs/audit/2026-10-27/deployment.md.
begin;

create table private.crm_admin_guard (
  singleton boolean primary key default true check (singleton),
  active_managers integer not null check (active_managers >= 0),
  bootstrap_completed boolean not null default false
);
insert into private.crm_admin_guard(singleton,active_managers,bootstrap_completed)
select true,count(*),count(*)>0 from public.profiles where role='gerente' and active;
alter table private.crm_admin_guard enable row level security;
revoke all on private.crm_admin_guard from public,anon,authenticated;
grant all on private.crm_admin_guard to service_role;

-- A counter updated by every relevant row change serializes concurrent removals,
-- including service-role writes. A count-then-update in application code does not.
create function private.protect_last_crm_manager() returns trigger
language plpgsql security definer set search_path='' as $$
declare was_manager boolean := false; is_manager_now boolean := false;
begin
  if tg_op <> 'INSERT' then was_manager := old.role='gerente' and old.active; end if;
  if tg_op <> 'DELETE' then is_manager_now := new.role='gerente' and new.active; end if;
  if is_manager_now and exists(select 1 from auth.users where id=new.id and (deleted_at is not null or banned_until>now())) then
    raise exception 'Reative primeiro a conta no provedor de autenticação.';
  end if;
  if was_manager and not is_manager_now then
    update private.crm_admin_guard set active_managers=active_managers-1
      where singleton and active_managers>1;
    if not found then raise exception 'Não é possível remover o último gerente ativo.' using errcode='23514'; end if;
  elsif is_manager_now and not was_manager then
    update private.crm_admin_guard set active_managers=active_managers+1,bootstrap_completed=true where singleton;
  end if;
  return coalesce(new,old);
end $$;
revoke all on function private.protect_last_crm_manager() from public,anon,authenticated;
create trigger crm_last_manager before insert or update of role,active or delete on public.profiles
for each row execute function private.protect_last_crm_manager();

-- Neither a public signup nor a later metadata change confers any access.
-- The existing administrative creation path explicitly provisions the profile afterwards.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_name text;
begin
  v_name := left(coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'),''),split_part(new.email,'@',1),'Colaborador'),200);
  insert into public.profiles(id,full_name,email,role,consultant_tag,active)
    values(new.id,v_name,new.email,'consultor_b2b',null,false) on conflict(id) do nothing;
  return new;
end $$;
revoke all on function public.handle_new_user() from public,anon,authenticated;

-- Sensitive profile changes are provisioned by authenticated server actions,
-- never by a browser writing its own profile (including a supervisor).
create or replace function public.guard_profile_update() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if current_user in ('anon','authenticated') and
    (new.role is distinct from old.role or new.active is distinct from old.active or new.email is distinct from old.email) then
    raise exception 'Use a gestão de usuários para alterar o acesso.' using errcode='42501';
  end if;
  return new;
end $$;
revoke insert,delete on public.profiles from anon,authenticated;

create function public.admin_update_crm_profile(p_actor uuid,p_target uuid,p_changes jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare actor_row public.profiles%rowtype; target_row public.profiles%rowtype; next_role text;
begin
  -- Execution is granted only to the backend service role; p_actor comes from getUser(), not input.
  perform 1 from private.crm_admin_guard where singleton for update;
  select * into actor_row from public.profiles where id=p_actor for update;
  if not found or actor_row.role<>'gerente' or not actor_row.active or actor_row.must_change_password or actor_row.password_reset_pending then
    raise exception 'Operação restrita ao Gerente Comercial.' using errcode='42501';
  end if;
  if jsonb_typeof(p_changes)<>'object' or exists(select 1 from jsonb_object_keys(p_changes) k where k not in ('role','active','full_name','email','consultant_tag')) then
    raise exception 'Campos de acesso inválidos.';
  end if;
  select * into target_row from public.profiles where id=p_target for update;
  if not found then raise exception 'Colaborador não encontrado.'; end if;
  next_role:=coalesce(p_changes->>'role',target_row.role);
  if next_role not in ('gerente','supervisor','consultor_b2b','high_school') then raise exception 'Perfil inválido.'; end if;
  if p_actor=p_target and (next_role<>target_row.role or (p_changes ? 'active' and not (p_changes->>'active')::boolean)) then
    raise exception 'Você não pode remover o próprio acesso administrativo.';
  end if;
  update public.profiles set
    role=next_role,
    active=case when p_changes ? 'active' then (p_changes->>'active')::boolean else active end,
    full_name=case when p_changes ? 'full_name' then nullif(btrim(p_changes->>'full_name'),'') else full_name end,
    email=case when p_changes ? 'email' then lower(btrim(p_changes->>'email')) else email end,
    consultant_tag=case when p_changes ? 'consultant_tag' then nullif(btrim(p_changes->>'consultant_tag'),'') else consultant_tag end
  where id=p_target;
  return p_target;
end $$;
revoke all on function public.admin_update_crm_profile(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.admin_update_crm_profile(uuid,uuid,jsonb) to service_role;

-- Auth soft-delete/ban must not leave an active profile counting as a manager.
create function private.guard_crm_auth_removal() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (new.deleted_at is not null and old.deleted_at is null)
    or (new.banned_until is not null and new.banned_until>now() and (old.banned_until is null or old.banned_until<=now())) then
    update public.profiles set active=false where id=new.id and active;
  end if;
  return new;
end $$;
revoke all on function private.guard_crm_auth_removal() from public,anon,authenticated;
create trigger crm_auth_removal before update of deleted_at,banned_until on auth.users
for each row execute function private.guard_crm_auth_removal();

-- Initial setup is one-shot and additionally gated by server-held setup credentials.
create function public.bootstrap_crm_profile(p_target uuid,p_name text,p_email text,p_tag text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare state private.crm_admin_guard%rowtype;
begin
  select * into state from private.crm_admin_guard where singleton for update;
  if state.active_managers<>0 or state.bootstrap_completed then raise exception 'Administrador já configurado.'; end if;
  update public.profiles set full_name=p_name,email=p_email,consultant_tag=p_tag,role='gerente',active=true where id=p_target;
  if not found then raise exception 'Perfil inicial não encontrado.'; end if;
  return p_target;
end $$;
revoke all on function public.bootstrap_crm_profile(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.bootstrap_crm_profile(uuid,text,text,text) to service_role;

commit;
