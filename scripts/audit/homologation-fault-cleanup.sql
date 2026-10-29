-- Disable the injected fault without dropping objects. Homologation only.
begin;
do $$begin
  if not exists(select 1 from auth.users where id='10000000-0000-4000-8000-000000000001'
    and email='audit-gerente-20261027@example.invalid') then
    raise exception 'Limpeza restrita à homologação fictícia da auditoria.';
  end if;
end$$;
create or replace function private.homologation_form_fault() returns trigger
language plpgsql set search_path='' as $$begin return new; end$$;
revoke all on function private.homologation_form_fault() from public,anon,authenticated;
commit;
