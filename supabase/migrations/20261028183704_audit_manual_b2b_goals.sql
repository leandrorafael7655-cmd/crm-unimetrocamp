begin;
create table public.b2b_cycle_results (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  commercial_cycle_id uuid not null references public.commercial_cycles(id) on delete restrict,
  target_value integer check(target_value>=0),
  registrations integer check(registrations>=0),
  notes text check(length(notes)<=5000),
  revision integer not null default 1,
  changed_by uuid not null references public.profiles(id),
  changed_at timestamptz not null default now(),
  unique(company_id,user_id,commercial_cycle_id)
);
create index b2b_results_user_cycle on public.b2b_cycle_results(user_id,commercial_cycle_id);
create table public.b2b_result_history (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.b2b_cycle_results(id) on delete restrict,
  user_id uuid not null references public.profiles(id),
  previous_values jsonb, new_values jsonb not null,
  changed_by uuid not null references public.profiles(id),
  changed_by_name text not null, changed_at timestamptz not null default now()
);
create index b2b_result_history_result on public.b2b_result_history(result_id,changed_at);
alter table public.b2b_cycle_results enable row level security;
alter table public.b2b_result_history enable row level security;
create policy b2b_results_read on public.b2b_cycle_results for select to authenticated
  using (exists(select 1 from public.profiles where id=auth.uid() and active and not must_change_password and not password_reset_pending) and (user_id=auth.uid() or public.is_manager()));
create policy b2b_results_insert on public.b2b_cycle_results for insert to authenticated
  with check (exists(select 1 from public.profiles where id=auth.uid() and role='gerente' and active and not must_change_password and not password_reset_pending));
create policy b2b_results_update on public.b2b_cycle_results for update to authenticated
  using (exists(select 1 from public.profiles where id=auth.uid() and role='gerente' and active and not must_change_password and not password_reset_pending))
  with check (exists(select 1 from public.profiles where id=auth.uid() and role='gerente' and active and not must_change_password and not password_reset_pending));
create policy b2b_result_history_read on public.b2b_result_history for select to authenticated
  using (exists(select 1 from public.profiles where id=auth.uid() and active and not must_change_password and not password_reset_pending) and (user_id=auth.uid() or public.is_manager()));
revoke all on public.b2b_cycle_results,public.b2b_result_history from public,anon,authenticated;
grant select,insert,update on public.b2b_cycle_results to authenticated;
grant select on public.b2b_result_history to authenticated;
grant all on public.b2b_cycle_results,public.b2b_result_history to service_role;
revoke all on public.b2b_cycle_results,public.b2b_result_history from anon;

create function private.stamp_b2b_result() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Preserve o histórico; corrija o lançamento.'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and role='gerente' and active and not must_change_password and not password_reset_pending) then
    raise exception 'Lançamento restrito ao gerente.' using errcode='42501'; end if;
  if tg_op='UPDATE' and (new.id<>old.id or new.company_id<>old.company_id or new.user_id<>old.user_id or new.commercial_cycle_id<>old.commercial_cycle_id) then
    raise exception 'Consultor, empresa e ciclo são a identidade do lançamento.'; end if;
  if not exists(select 1 from public.profiles where id=new.user_id and role in ('consultor','consultor_b2b','supervisor','gerente')) then raise exception 'Consultor B2B inválido.'; end if;
  new.revision:=case when tg_op='INSERT' then 1 else old.revision+1 end;
  new.changed_by:=auth.uid(); new.changed_at:=now(); return new;
end $$;
create function private.log_b2b_result() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.b2b_result_history(result_id,user_id,previous_values,new_values,changed_by,changed_by_name)
    select new.id,new.user_id,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new),auth.uid(),p.full_name from public.profiles p where p.id=auth.uid();
  return new;
end $$;
revoke all on function private.stamp_b2b_result(),private.log_b2b_result() from public,anon,authenticated;
create trigger stamp_b2b_result before insert or update or delete on public.b2b_cycle_results for each row execute function private.stamp_b2b_result();
create trigger log_b2b_result after insert or update on public.b2b_cycle_results for each row execute function private.log_b2b_result();

create function public.save_b2b_result(p_company uuid,p_user uuid,p_cycle uuid,p_target integer,p_registrations integer,p_notes text,p_revision integer)
returns uuid language plpgsql security invoker set search_path='' as $$
declare r public.b2b_cycle_results; result_id uuid;
begin
  select * into r from public.b2b_cycle_results where company_id=p_company and user_id=p_user and commercial_cycle_id=p_cycle for update;
  if found then
    if r.revision<>p_revision then raise exception 'Lançamento alterado por outra pessoa. Atualize antes de salvar.'; end if;
    update public.b2b_cycle_results set target_value=p_target,registrations=p_registrations,notes=p_notes where id=r.id returning id into result_id;
    if not found then raise exception 'Lançamento restrito ao gerente.' using errcode='42501'; end if;
  else
    if p_revision<>0 then raise exception 'Lançamento não encontrado.'; end if;
    insert into public.b2b_cycle_results(company_id,user_id,commercial_cycle_id,target_value,registrations,notes,changed_by)
      values(p_company,p_user,p_cycle,p_target,p_registrations,p_notes,auth.uid()) returning id into result_id;
  end if;
  return result_id;
end $$;
revoke all on function public.save_b2b_result(uuid,uuid,uuid,integer,integer,text,integer) from public,anon;
grant execute on function public.save_b2b_result(uuid,uuid,uuid,integer,integer,text,integer) to authenticated;
commit;
