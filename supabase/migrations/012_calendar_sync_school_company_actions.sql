-- UniConecta · calendário automático para High School e B2B.

alter table public.companies
  add column if not exists next_action_start_time time,
  add column if not exists next_action_end_time time,
  add column if not exists next_action_location text,
  add column if not exists next_action_owner_id uuid references public.profiles(id) on delete set null;

alter table public.companies drop constraint if exists companies_next_action_time_check;
alter table public.companies add constraint companies_next_action_time_check
check (
  (next_action_start_time is null and next_action_end_time is null)
  or
  (next_action_start_time is not null and next_action_end_time is not null and next_action_end_time > next_action_start_time)
);

create index if not exists companies_next_action_owner_date_idx
on public.companies(next_action_owner_id,data_proxima_acao)
where next_action_owner_id is not null and data_proxima_acao is not null;

create or replace function public.queue_calendar_invite_job(p_event_id uuid,p_operation text,p_sequence integer)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if p_operation not in ('REQUEST','CANCEL') then raise exception 'Operação de calendário inválida'; end if;
  insert into public.calendar_invite_jobs(calendar_event_id,operation,event_sequence,idempotency_key,status,attempts,last_error,next_attempt_at)
  values(
    p_event_id,p_operation,greatest(coalesce(p_sequence,0),0),
    p_event_id::text||':'||p_operation||':'||greatest(coalesce(p_sequence,0),0)::text,
    'pending',0,null,null
  ) on conflict(idempotency_key) do nothing;
end; $$;

create or replace function public.sync_calendar_event_db(
  p_source_type text,
  p_source_id uuid,
  p_recipient_user_id uuid,
  p_title text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_timezone text default 'America/Sao_Paulo',
  p_location text default null,
  p_description text default null,
  p_crm_path text default null,
  p_actor_id uuid default null,
  p_cancel boolean default false
) returns uuid language plpgsql security definer set search_path=''
as $$
declare r record; current_event record; new_sequence integer; event_id uuid;
begin
  if p_source_type not in ('attendance','school_action','company_activity') then
    raise exception 'Origem de calendário inválida';
  end if;

  if p_recipient_user_id is null or p_cancel then
    for r in
      select * from public.calendar_events
      where source_type=p_source_type and source_id=p_source_id and status<>'cancelled'
      for update
    loop
      new_sequence:=coalesce(r.sequence,0)+1;
      update public.calendar_events set status='cancelled',sequence=new_sequence,updated_by=p_actor_id,updated_at=now() where id=r.id;
      perform public.queue_calendar_invite_job(r.id,'CANCEL',new_sequence);
      event_id:=r.id;
    end loop;
    return event_id;
  end if;

  if p_start_at is null or p_end_at is null or p_end_at<=p_start_at then raise exception 'Horário de calendário inválido'; end if;

  for r in
    select * from public.calendar_events
    where source_type=p_source_type and source_id=p_source_id
      and recipient_user_id<>p_recipient_user_id and status<>'cancelled'
    for update
  loop
    new_sequence:=coalesce(r.sequence,0)+1;
    update public.calendar_events set status='cancelled',sequence=new_sequence,updated_by=p_actor_id,updated_at=now() where id=r.id;
    perform public.queue_calendar_invite_job(r.id,'CANCEL',new_sequence);
  end loop;

  select * into current_event from public.calendar_events
  where source_type=p_source_type and source_id=p_source_id and recipient_user_id=p_recipient_user_id
  for update;

  if found then
    if current_event.status='active'
      and current_event.title=p_title
      and current_event.start_at=p_start_at
      and current_event.end_at=p_end_at
      and current_event.timezone=coalesce(nullif(trim(p_timezone),''),'America/Sao_Paulo')
      and coalesce(current_event.location,'')=coalesce(nullif(trim(p_location),''),'')
      and coalesce(current_event.description,'')=coalesce(nullif(trim(p_description),''),'')
      and coalesce(current_event.crm_path,'')=coalesce(nullif(trim(p_crm_path),''),'') then
      return current_event.id;
    end if;

    new_sequence:=coalesce(current_event.sequence,0)+1;
    update public.calendar_events set
      title=p_title,start_at=p_start_at,end_at=p_end_at,
      timezone=coalesce(nullif(trim(p_timezone),''),'America/Sao_Paulo'),
      location=nullif(trim(p_location),''),description=nullif(trim(p_description),''),crm_path=nullif(trim(p_crm_path),''),
      status='active',sequence=new_sequence,updated_by=p_actor_id,updated_at=now()
    where id=current_event.id;
    perform public.queue_calendar_invite_job(current_event.id,'REQUEST',new_sequence);
    return current_event.id;
  end if;

  insert into public.calendar_events(source_type,source_id,recipient_user_id,title,start_at,end_at,timezone,location,description,crm_path,created_by,updated_by)
  values(
    p_source_type,p_source_id,p_recipient_user_id,p_title,p_start_at,p_end_at,
    coalesce(nullif(trim(p_timezone),''),'America/Sao_Paulo'),nullif(trim(p_location),''),nullif(trim(p_description),''),nullif(trim(p_crm_path),''),p_actor_id,p_actor_id
  ) returning id,sequence into event_id,new_sequence;
  perform public.queue_calendar_invite_job(event_id,'REQUEST',new_sequence);
  return event_id;
end; $$;

create or replace function public.sync_school_action_calendar_trigger()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  school_row record; actor_id uuid; title_text text; location_text text; description_text text;
  start_ts timestamptz; end_ts timestamptz;
  today_sp date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if tg_op='DELETE' then
    perform public.sync_calendar_event_db('school_action',old.id,old.primary_owner_id,'UniConecta · Ação de escola',now(),now()+interval '1 minute','America/Sao_Paulo',null,null,null,auth.uid(),true);
    return old;
  end if;

  -- Uma ação realizada preserva o compromisso histórico já ocorrido.
  if new.status='realizada' then return new; end if;
  actor_id:=coalesce(auth.uid(),new.created_by);

  if new.status='cancelada' or new.primary_owner_id is null or new.start_time is null or new.end_time is null or new.action_date<today_sp then
    perform public.sync_calendar_event_db('school_action',new.id,new.primary_owner_id,'UniConecta · Ação de escola',now(),now()+interval '1 minute','America/Sao_Paulo',null,null,null,actor_id,true);
    return new;
  end if;

  select name,cidade,logradouro,numero into school_row from public.schools where id=new.school_id;
  title_text:='UniConecta · '||coalesce(nullif(trim(new.action_type),''),'Ação de escola')||' · '||coalesce(nullif(trim(school_row.name),''),'Escola');
  location_text:=nullif(trim(concat_ws(', ',nullif(trim(school_row.logradouro),''),nullif(trim(school_row.numero),''),nullif(trim(school_row.cidade),''))),'');
  if location_text is null then location_text:=school_row.name; end if;
  description_text:=nullif(trim(concat_ws(E'\n',nullif(trim(new.objective),''),nullif(trim(new.notes),''))),'');
  start_ts:=(new.action_date+new.start_time) at time zone 'America/Sao_Paulo';
  end_ts:=(new.action_date+new.end_time) at time zone 'America/Sao_Paulo';

  perform public.sync_calendar_event_db(
    'school_action',new.id,new.primary_owner_id,title_text,start_ts,end_ts,'America/Sao_Paulo',
    location_text,description_text,'/high-school/escolas/'||new.school_id::text,actor_id,false
  );
  return new;
end; $$;

drop trigger if exists trg_sync_school_action_calendar on public.school_actions;
create trigger trg_sync_school_action_calendar after insert or update or delete on public.school_actions
for each row execute function public.sync_school_action_calendar_trigger();

create or replace function public.sync_company_next_action_calendar_trigger()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  actor_id uuid:=auth.uid(); title_text text; description_text text; start_ts timestamptz; end_ts timestamptz;
  today_sp date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if tg_op='DELETE' then
    perform public.sync_calendar_event_db('company_activity',old.id,old.next_action_owner_id,'UniConecta · Próximo passo B2B',now(),now()+interval '1 minute','America/Sao_Paulo',null,null,null,actor_id,true);
    return old;
  end if;

  if nullif(trim(new.proxima_acao),'') is null or new.data_proxima_acao is null or new.next_action_owner_id is null
    or new.next_action_start_time is null or new.next_action_end_time is null or new.data_proxima_acao<today_sp then
    perform public.sync_calendar_event_db('company_activity',new.id,new.next_action_owner_id,'UniConecta · Próximo passo B2B',now(),now()+interval '1 minute','America/Sao_Paulo',null,null,null,actor_id,true);
    return new;
  end if;

  title_text:='UniConecta · '||trim(new.proxima_acao)||' · '||coalesce(nullif(trim(new.nome_fantasia),''),new.razao_social);
  description_text:=nullif(trim(concat_ws(E'\n','Empresa: '||coalesce(nullif(trim(new.nome_fantasia),''),new.razao_social),nullif(trim(new.observacoes),''))),'');
  start_ts:=(new.data_proxima_acao+new.next_action_start_time) at time zone 'America/Sao_Paulo';
  end_ts:=(new.data_proxima_acao+new.next_action_end_time) at time zone 'America/Sao_Paulo';

  perform public.sync_calendar_event_db(
    'company_activity',new.id,new.next_action_owner_id,title_text,start_ts,end_ts,'America/Sao_Paulo',
    new.next_action_location,description_text,'/?view=agenda',actor_id,false
  );
  return new;
end; $$;

drop trigger if exists trg_sync_company_next_action_calendar on public.companies;
create trigger trg_sync_company_next_action_calendar
  after insert or update of proxima_acao,data_proxima_acao,next_action_start_time,next_action_end_time,next_action_location,next_action_owner_id,nome_fantasia,razao_social
  on public.companies
  for each row execute function public.sync_company_next_action_calendar_trigger();

-- Backfill idempotente: updates no-op acionam somente registros futuros completos.
update public.school_actions set updated_at=updated_at
where status in ('agendada','confirmada','reagendada') and primary_owner_id is not null
  and start_time is not null and end_time is not null
  and action_date >= (now() at time zone 'America/Sao_Paulo')::date;

update public.companies set updated_at=updated_at
where nullif(trim(proxima_acao),'') is not null and data_proxima_acao is not null and next_action_owner_id is not null
  and next_action_start_time is not null and next_action_end_time is not null
  and data_proxima_acao >= (now() at time zone 'America/Sao_Paulo')::date;

revoke all on function public.queue_calendar_invite_job(uuid,text,integer) from public,anon,authenticated;
revoke all on function public.sync_calendar_event_db(text,uuid,uuid,text,timestamptz,timestamptz,text,text,text,text,uuid,boolean) from public,anon,authenticated;
revoke all on function public.sync_school_action_calendar_trigger() from public,anon,authenticated;
revoke all on function public.sync_company_next_action_calendar_trigger() from public,anon,authenticated;
