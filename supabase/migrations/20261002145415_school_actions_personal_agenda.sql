-- Uma ação escolar tem vários destinatários, mas continua sendo um único registro no CRM.
-- Os gatilhos diferidos leem a lista final de participantes da transação do formulário.
create index if not exists school_action_participants_user_action_idx
  on public.school_action_participants(user_id,school_action_id);
create or replace function private.sync_school_action_calendar(p_action_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare
  action_row public.school_actions%rowtype;
  school_row record;
  current_event public.calendar_events%rowtype;
  recipient uuid;
  recipients uuid[] := '{}'::uuid[];
  actor_id uuid := auth.uid();
  title_text text; location_text text; description_text text; cycle_name text; people_text text;
  start_ts timestamptz; end_ts timestamptz; event_id uuid; event_sequence integer;
begin
  select * into action_row from public.school_actions where id=p_action_id for update;
  if not found then
    perform public.sync_calendar_event_db('school_action',p_action_id,null,'Ação em escola',now(),now()+interval '1 minute','America/Sao_Paulo',null,null,null,actor_id,true);
    return;
  end if;
  actor_id := coalesce(actor_id,action_row.created_by);
  -- A conclusão preserva o compromisso já ocorrido.
  if action_row.status='realizada' then return; end if;
  if action_row.status='cancelada' or action_row.start_time is null or action_row.end_time is null
    or action_row.action_date < (now() at time zone 'America/Sao_Paulo')::date then
    perform public.sync_calendar_event_db('school_action',p_action_id,null,'Ação em escola',now(),now()+interval '1 minute','America/Sao_Paulo',null,null,null,actor_id,true);
    return;
  end if;

  select coalesce(array_agg(distinct user_id), '{}'::uuid[]) into recipients from (
    select action_row.primary_owner_id as user_id
    union select user_id from public.school_action_participants where school_action_id=p_action_id
  ) people where user_id is not null;
  select name,logradouro,numero,cidade into school_row from public.schools where id=action_row.school_id;
  select name into cycle_name from public.supervest_cycles where id=action_row.supervest_cycle_id;
  select string_agg(coalesce(p.full_name,'Consultor'),', ' order by p.full_name,p.id) into people_text
    from public.profiles p where p.id=any(recipients);
  title_text := 'UniConecta · '||coalesce(school_row.name,'Escola')||' · '||coalesce(action_row.action_type,'Ação em escola');
  location_text := coalesce(nullif(btrim(action_row.location),''),nullif(btrim(concat_ws(', ',school_row.logradouro,school_row.numero,school_row.cidade)),''),school_row.name);
  description_text := concat_ws(E'\n','Escola: '||school_row.name,'Edição: '||coalesce(cycle_name,'Sem edição vinculada'),
    'Participantes: '||coalesce(people_text,'Não informados'),nullif(btrim(action_row.objective),''),nullif(btrim(action_row.notes),''));
  start_ts := (action_row.action_date+action_row.start_time) at time zone 'America/Sao_Paulo';
  end_ts := (action_row.action_date+action_row.end_time) at time zone 'America/Sao_Paulo';

  -- Cancela apenas quem saiu da ação; incluir um apoio nunca cancela o principal.
  for current_event in select * from public.calendar_events
    where source_type='school_action' and source_id=p_action_id and status<>'cancelled'
      and not (recipient_user_id=any(recipients)) for update
  loop
    event_sequence := current_event.sequence+1;
    update public.calendar_events set status='cancelled',sequence=event_sequence,updated_by=actor_id,updated_at=now() where id=current_event.id;
    perform public.queue_calendar_invite_job(current_event.id,'CANCEL',event_sequence);
  end loop;

  foreach recipient in array recipients loop
    select * into current_event from public.calendar_events
      where source_type='school_action' and source_id=p_action_id and recipient_user_id=recipient for update;
    if found then
      if current_event.status='active' and current_event.title=title_text and current_event.start_at=start_ts
        and current_event.end_at=end_ts and current_event.timezone='America/Sao_Paulo'
        and current_event.location is not distinct from location_text
        and current_event.description is not distinct from description_text
        and current_event.crm_path='/high-school/escolas/'||action_row.school_id::text then continue; end if;
      event_id := current_event.id;
      event_sequence := current_event.sequence+1;
      update public.calendar_events set title=title_text,start_at=start_ts,end_at=end_ts,timezone='America/Sao_Paulo',
        location=location_text,description=description_text,crm_path='/high-school/escolas/'||action_row.school_id::text,
        status='active',sequence=event_sequence,updated_by=actor_id,updated_at=now() where id=event_id;
    else
      insert into public.calendar_events(source_type,source_id,recipient_user_id,title,start_at,end_at,timezone,location,description,crm_path,created_by,updated_by)
        values('school_action',p_action_id,recipient,title_text,start_ts,end_ts,'America/Sao_Paulo',location_text,description_text,
          '/high-school/escolas/'||action_row.school_id::text,actor_id,actor_id)
        returning id,sequence into event_id,event_sequence;
    end if;
    perform public.queue_calendar_invite_job(event_id,'REQUEST',event_sequence);
  end loop;
end; $$;

create or replace function private.sync_school_action_agenda_trigger()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if tg_table_name='school_actions' then
    if tg_op='DELETE' then perform private.sync_school_action_calendar(old.id);
    else perform private.sync_school_action_calendar(new.id); end if;
  else
    if tg_op='DELETE' then perform private.sync_school_action_calendar(old.school_action_id);
    else
      if tg_op='UPDATE' and old.school_action_id is distinct from new.school_action_id then
        perform private.sync_school_action_calendar(old.school_action_id);
      end if;
      perform private.sync_school_action_calendar(new.school_action_id);
    end if;
  end if;
  return null;
end; $$;

revoke all on function private.sync_school_action_calendar(uuid) from public,anon,authenticated;
revoke all on function private.sync_school_action_agenda_trigger() from public,anon,authenticated;
drop trigger if exists trg_sync_school_action_calendar on public.school_actions;
create constraint trigger trg_sync_school_action_calendar after insert or update or delete on public.school_actions
  deferrable initially deferred for each row execute function private.sync_school_action_agenda_trigger();
create constraint trigger trg_sync_school_action_participant_calendar after insert or update or delete on public.school_action_participants
  deferrable initially deferred for each row execute function private.sync_school_action_agenda_trigger();

-- Alinha compromissos futuros existentes, sem modificar ações concluídas ou canceladas.
do $$declare action_id uuid; begin
  for action_id in select id from public.school_actions
    where status in ('agendada','confirmada','reagendada') and start_time is not null and end_time is not null
      and action_date >= (now() at time zone 'America/Sao_Paulo')::date
  loop perform private.sync_school_action_calendar(action_id); end loop;
end; $$;
