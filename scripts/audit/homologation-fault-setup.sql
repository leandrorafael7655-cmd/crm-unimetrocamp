-- Test fixture only. Never include in the production migration plan.
begin;
do $$begin
  if not exists(select 1 from auth.users where id='10000000-0000-4000-8000-000000000001'
    and email='audit-gerente-20261027@example.invalid') then
    raise exception 'Instale somente na homologação isolada com as contas fictícias da auditoria.';
  end if;
end$$;
create or replace function private.homologation_form_fault() returns trigger
language plpgsql set search_path='' as $$begin
  if new.razao_social like '[AUDITORIA FALHA]%' then raise exception 'Falha controlada de homologação'; end if;
  return new;
end$$;
revoke all on function private.homologation_form_fault() from public,anon,authenticated;
drop trigger if exists homologation_form_fault on public.companies;
create trigger homologation_form_fault before insert or update on public.companies
  for each row execute function private.homologation_form_fault();
commit;
