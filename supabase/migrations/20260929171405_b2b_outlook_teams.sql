-- Reuse the production contacts/activities tables. No changes to legacy SMTP queues.
alter table public.company_contacts
  add column is_primary boolean not null default false,
  add column observacoes text;
create unique index company_contacts_one_primary on public.company_contacts(company_id) where is_primary;
create unique index company_contacts_company_id_id on public.company_contacts(company_id,id);

alter table public.activities
  add column contact_id uuid,
  add column organizer_user_id uuid references public.profiles(id),
  add column organizer_name text,
  add column organizer_email text,
  add column contact_email text,
  add column meeting_type text check (meeting_type in ('presencial','teams')),
  add column title text,
  add column description text,
  add column start_at timestamptz,
  add column end_at timestamptz,
  add column location text,
  add column outlook_event_id text,
  add column outlook_web_url text,
  add column outlook_change_key text,
  add column teams_meeting_url text,
  add column revision integer not null default 0,
  add column sync_status text check (sync_status in ('pending','syncing','synced','failed')),
  add column sync_error text,
  add column sync_operation text check (sync_operation in ('create','update','cancel')),
  add column sync_payload jsonb,
  add column sync_lock uuid,
  add column sync_locked_at timestamptz,
  add column meeting_rsvp jsonb not null default '[]',
  add constraint activities_contact_company_fk foreign key (company_id, contact_id)
    references public.company_contacts(company_id,id) on delete restrict,
  add constraint activities_meeting_times check (meeting_type is null or end_at > start_at),
  add constraint activities_meeting_status check (meeting_type is null or status in
    ('agendada','confirmada','reagendamento_solicitado','realizada','cancelada','nao_compareceu'));
create index activities_meeting_organizer on public.activities(organizer_user_id,start_at) where meeting_type is not null;
create unique index activities_outlook_event on public.activities(organizer_user_id,outlook_event_id) where outlook_event_id is not null;
create index activities_contact on public.activities(contact_id) where contact_id is not null;

create table public.activity_participants (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  name text not null default '',
  email text not null,
  participant_type text not null default 'optional' check (participant_type = 'optional'),
  unique(activity_id,email)
);
alter table public.activity_participants enable row level security;
revoke all on public.activity_participants from anon, authenticated;
grant select on public.activity_participants to authenticated;
grant all on public.activity_participants to service_role;
create policy activity_participants_read on public.activity_participants for select to authenticated
using (exists(select 1 from public.activities a where a.id = activity_id)
  and exists(select 1 from public.profiles p where p.id = (select auth.uid()) and p.active));

-- Encrypted tokens are server-only; no browser/user role can read or write them.
create table public.microsoft_calendar_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  microsoft_user_id text not null unique,
  tenant_id text not null,
  email text not null,
  access_token_encrypted text not null,
  refresh_token_encrypted text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.microsoft_calendar_accounts enable row level security;
revoke all on public.microsoft_calendar_accounts from public, anon, authenticated;
grant all on public.microsoft_calendar_accounts to service_role;

-- Existing permissive policies must not bypass the Outlook lifecycle.
create policy activities_meeting_insert_backend on public.activities as restrictive for insert to authenticated
with check (meeting_type is null and organizer_user_id is null and outlook_event_id is null and sync_status is null);
create policy activities_meeting_update_backend on public.activities as restrictive for update to authenticated
using (meeting_type is null)
with check (meeting_type is null and organizer_user_id is null and outlook_event_id is null and sync_status is null);
create policy activities_meeting_delete_backend on public.activities as restrictive for delete to authenticated
using (meeting_type is null);

create function public.b2b_keep_meeting_history() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if old.meeting_type is not null then
    raise exception 'Cancele a reunião e mantenha seu histórico. Empresas com reuniões não podem ser excluídas.';
  end if;
  return old;
end $$;
create trigger b2b_keep_meeting_history before delete on public.activities
for each row execute function public.b2b_keep_meeting_history();
revoke all on function public.b2b_keep_meeting_history() from public, anon, authenticated;

create function public.b2b_save_contact(p_company uuid, p_id uuid, p_data jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare v_id uuid := coalesce(p_id,gen_random_uuid()); v_primary boolean;
begin
  perform 1 from public.companies where id=p_company for update;
  if not found then raise exception 'Empresa não encontrada.'; end if;
  if p_id is not null and not exists(select 1 from public.company_contacts where id=p_id and company_id=p_company)
    then raise exception 'Contato não pertence à empresa.'; end if;
  v_primary := coalesce((p_data->>'is_primary')::boolean,false)
    or not exists(select 1 from public.company_contacts where company_id=p_company and is_primary and id<>v_id);
  if v_primary then update public.company_contacts set is_primary=false where company_id=p_company and is_primary; end if;
  insert into public.company_contacts(id,company_id,nome,cargo,email,telefone,observacoes,is_primary)
  values(v_id,p_company,p_data->>'nome',p_data->>'cargo',p_data->>'email',p_data->>'telefone',p_data->>'observacoes',v_primary)
  on conflict(id) do update set nome=excluded.nome,cargo=excluded.cargo,email=excluded.email,
    telefone=excluded.telefone,observacoes=excluded.observacoes,is_primary=excluded.is_primary,updated_at=now();
  return v_id;
end $$;

-- A durable outbox lives on the activity. Changes are staged before Graph and
-- committed only after success. CAS revision + row locks prevent concurrent edits.
create function public.b2b_stage_meeting(p_id uuid, p_actor uuid, p_revision integer, p_operation text, p_payload jsonb)
returns public.activities language plpgsql security invoker set search_path = '' as $$
declare v public.activities;
begin
  if p_operation not in ('create','update','cancel') then raise exception 'Operação inválida.'; end if;
  if p_operation='create' then
    insert into public.activities(id,company_id,organizer_user_id,organizer_name,organizer_email,
      contact_id,contato,contact_email,consultor,primary_owner_id,data,tipo,status,conta_meta_semanal,
      meeting_type,title,description,observacao,start_at,end_at,location,revision,sync_status,sync_operation,sync_payload)
    values(p_id,(p_payload->>'company_id')::uuid,p_actor,p_payload->>'organizer_name',p_payload->>'organizer_email',
      (p_payload->>'contact_id')::uuid,p_payload->>'contact_name',p_payload->>'contact_email',p_payload->>'organizer_name',p_actor,
      (p_payload->>'date')::date,'Reunião','agendada',false,p_payload->>'meeting_type',p_payload->>'title',
      p_payload->>'description',p_payload->>'description',(p_payload->>'start_at')::timestamptz,
      (p_payload->>'end_at')::timestamptz,p_payload->>'location',1,'pending','create',p_payload)
    on conflict(id) do nothing;
  end if;
  select * into v from public.activities where id=p_id for update;
  if not found or v.organizer_user_id is distinct from p_actor or v.meeting_type is null then
    raise exception 'Reunião não encontrada ou organizador inválido.'; end if;
  if p_operation='create' then
    if v.revision<>1 or v.sync_payload is distinct from p_payload then
      raise exception 'Este agendamento já foi registrado. Atualize a ficha.'; end if;
    return v;
  end if;
  if v.revision<>p_revision then raise exception 'A reunião foi alterada. Atualize a ficha antes de editar.'; end if;
  if v.sync_status <> 'synced' then raise exception 'Conclua a sincronização pendente antes de alterar a reunião.'; end if;
  if v.status in ('cancelada','realizada','nao_compareceu') then raise exception 'Esta reunião já foi encerrada.'; end if;
  update public.activities set sync_operation=p_operation,sync_payload=p_payload,sync_status='pending',sync_error=null,
    revision=revision+1,updated_at=now() where id=p_id returning * into v;
  return v;
end $$;

create function public.b2b_finish_meeting(p_id uuid,p_lock uuid,p_event jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare v public.activities; p jsonb;
begin
  select * into v from public.activities where id=p_id and sync_lock=p_lock and sync_status='syncing' for update;
  if not found then raise exception 'Processamento já concluído ou expirado.'; end if;
  p := v.sync_payload;
  if v.sync_operation='cancel' then
    update public.activities set status='cancelada',sync_status='synced',sync_error=null,sync_operation=null,
      sync_payload=null,sync_lock=null,sync_locked_at=null,updated_at=now() where id=p_id;
    return;
  end if;
  if nullif(p_event->>'id','') is null then raise exception 'Outlook não retornou o identificador do evento.'; end if;
  update public.activities set contact_id=(p->>'contact_id')::uuid,contato=p->>'contact_name',contact_email=p->>'contact_email',
    title=p->>'title',description=p->>'description',observacao=p->>'description',meeting_type=p->>'meeting_type',
    tipo=case when p->>'meeting_type'='teams' then 'Reunião on-line' else 'Reunião presencial' end,
    data=(p->>'date')::date,start_at=(p->>'start_at')::timestamptz,end_at=(p->>'end_at')::timestamptz,location=p->>'location',
    status='agendada',outlook_event_id=p_event->>'id',outlook_web_url=p_event->>'webLink',
    teams_meeting_url=coalesce(p_event#>>'{onlineMeeting,joinUrl}',teams_meeting_url),outlook_change_key=p_event->>'changeKey',
    sync_status='synced',sync_error=null,sync_operation=null,sync_payload=null,sync_lock=null,sync_locked_at=null,
    meeting_rsvp='[]',updated_at=now() where id=p_id;
  delete from public.activity_participants where activity_id=p_id;
  insert into public.activity_participants(activity_id,name,email)
    select p_id,x->>'name',x->>'email' from jsonb_array_elements(p->'participants') x;
end $$;

revoke all on function public.b2b_save_contact(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.b2b_stage_meeting(uuid,uuid,integer,text,jsonb) from public,anon,authenticated;
revoke all on function public.b2b_finish_meeting(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.b2b_save_contact(uuid,uuid,jsonb) to service_role;
grant execute on function public.b2b_stage_meeting(uuid,uuid,integer,text,jsonb) to service_role;
grant execute on function public.b2b_finish_meeting(uuid,uuid,jsonb) to service_role;
