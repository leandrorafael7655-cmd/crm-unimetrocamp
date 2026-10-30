-- Additive contact invitations. Does NOT consume/backfill the legacy queue or lift its hold.
begin;
create table public.contact_meetings (
  id uuid primary key,
  company_id uuid references public.companies(id) on delete restrict,
  school_id uuid references public.schools(id) on delete restrict,
  entity_name text not null,
  responsible_user_id uuid not null references public.profiles(id) on delete restrict,
  subject text not null check (length(btrim(subject)) between 1 and 180),
  description text not null default '' check (length(description)<=10000),
  mode text not null check (mode in ('online','presencial')),
  meeting_url text check (meeting_url is null or (length(meeting_url)<=2000 and meeting_url ~ '^https://[^/@[:space:]]+([/:?#][^[:space:]]*)?$' and meeting_url !~ '^https://[^/]*@')),
  location text not null default '' check (length(location)<=300),
  start_at timestamptz not null, end_at timestamptz not null,
  status text not null default 'agendada' check (status in ('agendada','cancelada')),
  revision integer not null default 1 check (revision>=1),
  event_uid text not null unique default (gen_random_uuid()::text||'@uniconecta'),
  organizer_email text,
  -- Explicit per-meeting hold: production acceptance must approve actual IDs first.
  delivery_enabled boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (num_nonnulls(company_id,school_id)=1), check (end_at>start_at),
  check (mode<>'online' or meeting_url is not null),
  check (mode<>'presencial' or length(btrim(location))>0)
);
create index contact_meetings_company on public.contact_meetings(company_id,start_at);
create index contact_meetings_school on public.contact_meetings(school_id,start_at);
create index contact_meetings_responsible on public.contact_meetings(responsible_user_id,start_at);

create table public.contact_meeting_recipients (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.contact_meetings(id) on delete restrict,
  kind text not null check (kind in ('consultant','contact')),
  contact_id uuid, name text not null, email text not null,
  check ((kind='consultant')=(contact_id is null)),
  check (email=lower(btrim(email)) and length(email)<=254 and email ~ '^[^[:space:]@<>:;,"\\]+@[^[:space:]@<>:;,"\\]+\.[^[:space:]@<>:;,"\\]+$')
);
create unique index contact_meeting_consultant on public.contact_meeting_recipients(meeting_id) where kind='consultant';
create unique index contact_meeting_selected_contact on public.contact_meeting_recipients(meeting_id,contact_id) where kind='contact';
create index contact_meeting_recipient_meeting on public.contact_meeting_recipients(meeting_id,email);

create table public.contact_meeting_jobs (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.contact_meetings(id) on delete restrict,
  recipient_email text not null,
  operation text not null check (operation in ('REQUEST','CANCEL')),
  event_sequence integer not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','sent_provider','failed','superseded','delivery_unknown')),
  attempts integer not null default 0, lease_token uuid, last_error text,
  provider_message_id text, sent_at timestamptz, next_attempt_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(meeting_id,event_sequence,operation,recipient_email)
);
create index contact_meeting_jobs_due on public.contact_meeting_jobs(next_attempt_at,created_at) where status in ('pending','failed');
create unique index contact_meeting_jobs_processing on public.contact_meeting_jobs(meeting_id) where status='processing';

alter table public.activities add column contact_meeting_id uuid unique references public.contact_meetings(id) on delete restrict;
alter table public.school_actions add column contact_meeting_id uuid unique references public.contact_meetings(id) on delete restrict;

alter table public.contact_meetings enable row level security;
alter table public.contact_meeting_recipients enable row level security;
alter table public.contact_meeting_jobs enable row level security;
revoke all on public.contact_meetings,public.contact_meeting_recipients,public.contact_meeting_jobs from public,anon,authenticated;
grant select on public.contact_meetings,public.contact_meeting_recipients,public.contact_meeting_jobs to authenticated;
grant all on public.contact_meetings,public.contact_meeting_recipients,public.contact_meeting_jobs to service_role;
create policy contact_meetings_read on public.contact_meetings for select to authenticated using (
  exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active
    and not coalesce(p.must_change_password,false) and not coalesce(p.password_reset_pending,false)
    and (p.id=responsible_user_id or p.role in ('gerente','supervisor')))
);
create policy contact_meeting_recipients_read on public.contact_meeting_recipients for select to authenticated using (
  exists(select 1 from public.contact_meetings m where m.id=meeting_id)
);
create policy contact_meeting_jobs_read on public.contact_meeting_jobs for select to authenticated using (
  exists(select 1 from public.contact_meetings m where m.id=meeting_id)
);

-- Protect the shared source row against legacy editors; the IDs never duplicate agenda entries.
create function private.guard_contact_meeting_source() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='DELETE' then
    if old.contact_meeting_id is not null then raise exception 'Cancele a reunião e preserve o histórico.'; end if;
    return old;
  end if;
  if tg_op='UPDATE' and old.contact_meeting_id is distinct from new.contact_meeting_id then
    raise exception 'O vínculo da reunião não pode ser alterado.';
  end if;
  if new.contact_meeting_id is not null and
    current_setting('uniconecta.contact_meeting_write',true) is distinct from new.contact_meeting_id::text then
    raise exception 'Altere esta reunião pelo painel Reuniões e convites da ficha.';
  end if;
  return new;
end $$;
revoke all on function private.guard_contact_meeting_source() from public,anon,authenticated;
create trigger guard_contact_meeting_source before insert or update or delete on public.activities
  for each row execute function private.guard_contact_meeting_source();
create trigger guard_contact_meeting_source before insert or update or delete on public.school_actions
  for each row execute function private.guard_contact_meeting_source();

-- Preserve the old school synchronizer exactly for legacy actions. New meetings use their own outbox.
create or replace function private.sync_school_action_agenda_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
declare action_id uuid;
begin
  if tg_table_name='school_actions' then
    if tg_op='DELETE' then action_id:=old.id; else action_id:=new.id; end if;
  else
    if tg_op='DELETE' then action_id:=old.school_action_id; else action_id:=new.school_action_id; end if;
  end if;
  if tg_table_name<>'school_actions' and tg_op='UPDATE' then
    if old.school_action_id is distinct from new.school_action_id and
      not exists(select 1 from public.contact_meetings m where m.id=old.school_action_id) then
      perform private.sync_school_action_calendar(old.school_action_id);
    end if;
  end if;
  if not exists(select 1 from public.contact_meetings m where m.id=action_id) then
    perform private.sync_school_action_calendar(action_id);
  end if;
  return null;
end $$;
revoke all on function private.sync_school_action_agenda_trigger() from public,anon,authenticated;

create function public.save_contact_meeting(p_actor uuid,p_id uuid,p_revision integer,p_entity text,p_entity_id uuid,
  p_operation text,p_data jsonb,p_contacts uuid[],p_sender text default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
  actor public.profiles; m public.contact_meetings; entity_name text; entity_owner uuid; archived timestamptz;
  c record; people jsonb; person jsonb; operation text; description_text text; same_contacts uuid[];
  starts timestamptz; ends timestamptz;
begin
  if p_operation not in ('create','update','cancel') or p_entity not in ('company','school') or p_revision<0 then raise exception 'Operação inválida.'; end if;
  select * into actor from public.profiles where id=p_actor and active
    and not coalesce(must_change_password,false) and not coalesce(password_reset_pending,false);
  if not found then raise exception 'Consultor indisponível ou troca de senha pendente.'; end if;
  if p_entity='company' then
    if actor.role not in ('gerente','supervisor','consultor','consultor_b2b') then raise exception 'Sem permissão B2B.'; end if;
    select coalesce(nullif(nome_fantasia,''),razao_social),owner_id,archived_at into entity_name,entity_owner,archived
      from public.companies where id=p_entity_id for share;
    if entity_name is null or (actor.role not in ('gerente','supervisor') and entity_owner is distinct from actor.id) then raise exception 'Empresa fora da sua carteira.'; end if;
  else
    if actor.role not in ('gerente','supervisor','consultor','consultor_b2b','high_school') then raise exception 'Sem permissão High School.'; end if;
    select name,archived_at into entity_name,archived from public.schools where id=p_entity_id for share;
    if entity_name is null then raise exception 'Escola não encontrada.'; end if;
  end if;
  -- One lock orders create/update/cancel and prevents revision races.
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,6028));
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,6029));
  select * into m from public.contact_meetings where id=p_id for update;
  if found then
    if p_operation='create' then raise exception 'Reunião já registrada. Atualize a ficha.'; end if;
    if m.responsible_user_id<>p_actor or coalesce(m.company_id,m.school_id)<>p_entity_id or
      (m.company_id is not null)<>(p_entity='company') then raise exception 'Somente o consultor responsável pode alterar esta reunião.'; end if;
    if m.revision<>p_revision then raise exception 'Reunião alterada. Atualize a ficha.'; end if;
    if m.status='cancelada' then raise exception 'Reunião já cancelada.'; end if;
    if exists(select 1 from public.contact_meeting_jobs where meeting_id=p_id and status in ('processing','delivery_unknown')) then
      raise exception 'Envio em processamento ou sem confirmação. Confira o histórico antes de alterar a reunião.'; end if;
    select coalesce(array_agg(contact_id order by contact_id),'{}'::uuid[]) into same_contacts
      from public.contact_meeting_recipients where meeting_id=p_id and kind='contact';
    if p_operation='update' and same_contacts is distinct from
      (select coalesce(array_agg(distinct x order by x),'{}'::uuid[]) from unnest(p_contacts) x) then
      raise exception 'Preserve os destinatários originais; cancele e crie outra reunião para mudar a lista.';
    end if;
  elsif p_operation<>'create' or p_revision<>0 then raise exception 'Reunião não encontrada.';
  end if;
  if p_operation<>'cancel' then
    if archived is not null then raise exception 'Reative a ficha antes de agendar.'; end if;
    starts:=(p_data->>'start_at')::timestamptz; ends:=(p_data->>'end_at')::timestamptz;
    if starts<=now() or starts is null or ends is null or ends<=starts then raise exception 'Horário futuro inválido.'; end if;
    if coalesce(p_data->>'subject','') ~* '^UniConecta\s*\|' then raise exception 'Informe só o assunto.'; end if;
    if exists(select 1 from public.contact_meetings other where other.responsible_user_id=p_actor and other.id<>p_id
      and other.status='agendada' and other.start_at<ends and other.end_at>starts) then raise exception 'Há outra reunião neste horário.'; end if;
    if p_operation='create' then
      insert into public.contact_meetings(id,company_id,school_id,entity_name,responsible_user_id,subject,description,mode,meeting_url,location,start_at,end_at,organizer_email)
      values(p_id,case when p_entity='company' then p_entity_id end,case when p_entity='school' then p_entity_id end,
        entity_name,p_actor,btrim(p_data->>'subject'),coalesce(p_data->>'description',''),p_data->>'mode',nullif(btrim(p_data->>'meeting_url'),''),case when p_data->>'mode'='online' then '' else coalesce(p_data->>'location','') end,starts,ends,lower(nullif(btrim(p_sender),'')));
      insert into public.contact_meeting_recipients(meeting_id,kind,name,email)
        values(p_id,'consultant',actor.full_name,lower(btrim(actor.email)));
      if coalesce(cardinality(p_contacts),0)>100 then raise exception 'Selecione até 100 contatos.'; end if;
      for c in select distinct x as id from unnest(p_contacts) x loop
        if p_entity='company' then
          insert into public.contact_meeting_recipients(meeting_id,kind,contact_id,name,email)
            select p_id,'contact',id,nome,lower(btrim(email)) from public.company_contacts where id=c.id and company_id=p_entity_id;
        else
          insert into public.contact_meeting_recipients(meeting_id,kind,contact_id,name,email)
            select p_id,'contact',id,name,lower(btrim(email)) from public.school_contacts where id=c.id and school_id=p_entity_id;
        end if;
        if not found then raise exception 'Contato não pertence à ficha.'; end if;
      end loop;
    else
      update public.contact_meetings set subject=btrim(p_data->>'subject'),description=coalesce(p_data->>'description',''),
        mode=p_data->>'mode',meeting_url=nullif(btrim(p_data->>'meeting_url'),''),location=case when p_data->>'mode'='online' then '' else coalesce(p_data->>'location','') end,
        start_at=starts,end_at=ends,revision=revision+1,updated_at=now() where id=p_id;
    end if;
  else
    update public.contact_meetings set status='cancelada',revision=revision+1,updated_at=now() where id=p_id;
  end if;
  select * into m from public.contact_meetings where id=p_id;
  if exists(select 1 from public.contact_meeting_recipients where meeting_id=p_id and email=m.organizer_email) then
    raise exception 'O remetente central deve ser diferente dos destinatários.';
  end if;
  perform set_config('uniconecta.contact_meeting_write',p_id::text,true);
  if p_entity='company' then
    if p_operation='create' then
      insert into public.activities(id,company_id,consultor,primary_owner_id,organizer_user_id,organizer_name,organizer_email,data,tipo,status,
        conta_meta_semanal,meeting_type,title,description,observacao,start_at,end_at,location,revision,sync_status,calendar_provider,meeting_url,email_queued_revision,contact_meeting_id)
      values(p_id,p_entity_id,actor.full_name,p_actor,p_actor,actor.full_name,actor.email,(m.start_at at time zone 'America/Sao_Paulo')::date,
        'Reunião','agendada',false,m.mode,m.subject,m.description,m.description,m.start_at,m.end_at,m.location,1,'synced','email',m.meeting_url,1,p_id);
    else
      update public.activities set title=m.subject,description=m.description,observacao=m.description,meeting_type=m.mode,
        data=(m.start_at at time zone 'America/Sao_Paulo')::date,start_at=m.start_at,end_at=m.end_at,location=m.location,meeting_url=m.meeting_url,
        status=m.status,revision=m.revision+1,email_queued_revision=m.revision+1,updated_at=now() where id=p_id;
    end if;
  else
    if p_operation='create' then
      insert into public.school_actions(id,school_id,action_date,start_time,end_time,action_type,objective,status,notes,primary_owner_id,primary_owner_name,created_by,location,contact_meeting_id)
      values(p_id,p_entity_id,(m.start_at at time zone 'America/Sao_Paulo')::date,(m.start_at at time zone 'America/Sao_Paulo')::time,
        (m.end_at at time zone 'America/Sao_Paulo')::time,'Reunião',m.subject,'agendada',m.description,p_actor,actor.full_name,p_actor,
        case when m.mode='online' then m.meeting_url else nullif(m.location,'') end,p_id);
    else
      update public.school_actions set action_date=(m.start_at at time zone 'America/Sao_Paulo')::date,
        start_time=(m.start_at at time zone 'America/Sao_Paulo')::time,end_time=(m.end_at at time zone 'America/Sao_Paulo')::time,
        objective=m.subject,notes=m.description,status=m.status,location=case when m.mode='online' then m.meeting_url else nullif(m.location,'') end,updated_at=now() where id=p_id;
    end if;
  end if;
  -- Snapshot recipients once. Deduplicate transport by address, retain every selected contact in history.
  select jsonb_agg(jsonb_build_object('name',name,'email',email) order by email) into people from
    (select distinct on (email) name,email from public.contact_meeting_recipients where meeting_id=p_id order by email,kind) unique_people;
  operation:=case when p_operation='cancel' then 'CANCEL' else 'REQUEST' end;
  update public.contact_meeting_jobs set status='superseded',updated_at=now(),last_error='Substituído por uma versão mais recente; não enviar.'
    where meeting_id=p_id and status in ('pending','failed') and event_sequence<m.revision-1;
  description_text:=concat(m.entity_name,E'\n\n',m.description,
    case when m.meeting_url is not null then E'\n\nLink da reunião (Teams): '||m.meeting_url else '' end,
    E'\n\nAceite na sua agenda. A resposta não é importada automaticamente para o CRM.');
  for person in select value from jsonb_array_elements(people) loop
    insert into public.contact_meeting_jobs(meeting_id,recipient_email,operation,event_sequence,payload)
    values(p_id,person->>'email',operation,m.revision-1,jsonb_build_object('event_uid',m.event_uid,
      'title','UniConecta | '||m.subject||' | '||m.entity_name,'description',description_text,
      'start_at',m.start_at,'end_at',m.end_at,'location',case when m.mode='online' then m.meeting_url else nullif(m.location,'') end,
      'meeting_url',m.meeting_url,'organizer',m.organizer_email,'recipient',person,
      -- Separate messages disclose no other attendee addresses.
      'attendees',jsonb_build_array(person))) on conflict do nothing;
  end loop;
  return p_id;
end $$;
revoke all on function public.save_contact_meeting(uuid,uuid,integer,text,uuid,text,jsonb,uuid[],text) from public,anon,authenticated;
grant execute on function public.save_contact_meeting(uuid,uuid,integer,text,uuid,text,jsonb,uuid[],text) to service_role;

create function public.claim_contact_meeting_job(p_meeting uuid,p_user uuid,p_test_email text,p_sender text,p_exclude uuid[] default '{}'::uuid[])
returns setof public.contact_meeting_jobs language plpgsql security invoker set search_path='' as $$
declare m public.contact_meetings; j public.contact_meeting_jobs;
begin
  if p_sender is null or p_sender !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$' then raise exception 'Remetente inválido.'; end if;
  for m in select candidate.* from public.contact_meetings candidate
    where delivery_enabled and exists(select 1 from public.profiles p where p.id=candidate.responsible_user_id and p.active
      and not coalesce(p.must_change_password,false) and not coalesce(p.password_reset_pending,false)) and (p_meeting is null or id=p_meeting) and (p_user is null or responsible_user_id=p_user)
      and (p_test_email is null or not exists(select 1 from public.contact_meeting_recipients r where r.meeting_id=candidate.id and r.email<>p_test_email))
    order by updated_at,id for update skip locked
  loop
    update public.contact_meeting_jobs set status='delivery_unknown',lease_token=null,next_attempt_at=null,updated_at=now(),last_error='Entrega sem confirmação. Confira o SMTP e o histórico antes de autorizar nova tentativa.'
      where meeting_id=m.id and status='processing' and updated_at<now()-interval '10 minutes';
    if exists(select 1 from public.contact_meeting_jobs where meeting_id=m.id and status in ('processing','delivery_unknown')) then continue; end if;
    if m.organizer_email is not null and m.organizer_email<>lower(btrim(p_sender)) then continue; end if;
    if exists(select 1 from public.contact_meeting_recipients where meeting_id=m.id and email=lower(btrim(p_sender))) then continue; end if;
    select q.* into j from public.contact_meeting_jobs q where meeting_id=m.id and q.id<>all(coalesce(p_exclude,'{}'::uuid[])) and event_sequence=m.revision-1
      and status in ('pending','failed') and (p_meeting is not null or next_attempt_at is null or next_attempt_at<=now())
      order by created_at,id limit 1 for update skip locked;
    if not found then continue; end if;
    update public.contact_meetings set organizer_email=lower(btrim(p_sender)) where id=m.id and organizer_email is null;
    update public.contact_meeting_jobs set status='processing',attempts=attempts+1,lease_token=gen_random_uuid(),updated_at=now(),
      payload=jsonb_set(payload,'{organizer}',to_jsonb(lower(btrim(p_sender)))) where id=j.id returning * into j;
    return next j; return;
  end loop;
end $$;
revoke all on function public.claim_contact_meeting_job(uuid,uuid,text,text,uuid[]) from public,anon,authenticated;
grant execute on function public.claim_contact_meeting_job(uuid,uuid,text,text,uuid[]) to service_role;
commit;
