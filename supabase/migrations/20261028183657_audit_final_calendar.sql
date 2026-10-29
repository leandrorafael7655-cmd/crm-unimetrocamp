begin;
-- Only Vercel workers with the administrative client may consume/update the queue.
alter table public.calendar_invite_jobs add column lease_token uuid;
revoke insert,update,delete on public.calendar_invite_jobs from authenticated;
create index calendar_jobs_due on public.calendar_invite_jobs(next_attempt_at,created_at) where status in ('pending','failed');
create unique index calendar_jobs_processing_event on public.calendar_invite_jobs(calendar_event_id) where status='processing' and calendar_event_id is not null;
create unique index calendar_jobs_processing_meeting on public.calendar_invite_jobs(meeting_activity_id) where status='processing' and meeting_activity_id is not null;

create function public.claim_calendar_email_jobs(p_limit integer default 10,p_user uuid default null,p_meeting uuid default null)
returns setof public.calendar_invite_jobs language plpgsql security invoker set search_path='' as $$
declare j public.calendar_invite_jobs; source_key text; n integer:=0;
begin
  update public.calendar_invite_jobs set status='failed',lease_token=null,next_attempt_at=now(),
    last_error='Processamento interrompido; nova tentativa pendente.',updated_at=now()
    where status='processing' and updated_at<now()-interval '10 minutes';
  for j in select q.* from public.calendar_invite_jobs q
    where q.status in ('pending','failed') and (p_meeting is not null or q.next_attempt_at is null or q.next_attempt_at<=now())
      and (p_meeting is null or q.meeting_activity_id=p_meeting)
      and (p_user is null or exists(select 1 from public.calendar_events e where e.id=q.calendar_event_id and e.recipient_user_id=p_user)
        or exists(select 1 from public.activities a where a.id=q.meeting_activity_id and a.organizer_user_id=p_user))
    order by q.event_sequence desc,q.created_at,q.id limit least(greatest(p_limit,1),25)*5 for update skip locked
  loop
    source_key:=coalesce(j.calendar_event_id,j.meeting_activity_id)::text;
    if not pg_try_advisory_xact_lock(hashtextextended(source_key,27)) then continue; end if;
    if exists(select 1 from public.calendar_invite_jobs q where q.status='processing'
      and (q.calendar_event_id=j.calendar_event_id or q.meeting_activity_id=j.meeting_activity_id)) then continue; end if;
    update public.calendar_invite_jobs set status='processing',attempts=attempts+1,lease_token=gen_random_uuid(),updated_at=now()
      where id=j.id returning * into j;
    return next j; n:=n+1;
    if n>=least(greatest(p_limit,1),25) then exit; end if;
  end loop;
end $$;
revoke all on function public.claim_calendar_email_jobs(integer,uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_calendar_email_jobs(integer,uuid,uuid) to service_role;

create or replace function public.b2b_queue_email_meeting(p_id uuid,p_sender text) returns void
language plpgsql security invoker set search_path='' as $$
declare
  v public.activities; p jsonb; old_people jsonb; new_people jsonb; old_event jsonb; new_event jsonb;
  person jsonb; sender text; operation text;
begin
  select * into v from public.activities where id=p_id for update;
  if not found or v.calendar_provider<>'email' or v.meeting_type is null then raise exception 'Agendamento por e-mail não encontrado.'; end if;
  if v.sync_status='synced' or v.email_queued_revision=v.revision then return; end if;
  if nullif(trim(p_sender),'') is null then raise exception 'Remetente não configurado.'; end if;
  sender := coalesce(v.calendar_organizer_email,lower(trim(p_sender)));
  if sender<>lower(trim(p_sender)) then raise exception 'Preserve o remetente original para atualizar o convite.'; end if;
  select jsonb_build_array(jsonb_build_object('name',pr.full_name,'email',pr.email,'role','REQ-PARTICIPANT'))
    into old_people from public.profiles pr where pr.id=v.organizer_user_id and pr.active;
  if old_people is null then raise exception 'Responsável do CRM indisponível.'; end if;
  if v.email_queued_revision=0 then old_people := '[]'; end if;
  old_event := jsonb_build_object('event_uid',v.calendar_uid,'title',v.title,'start_at',v.start_at,'end_at',v.end_at,
    'description',v.description,'location',coalesce(v.meeting_url,v.location),'sequence',v.revision,'organizer',sender,'attendees',old_people);
  operation := case when v.sync_operation='cancel' then 'CANCEL' else 'REQUEST' end;
  if operation='CANCEL' then
    new_people := old_people; new_event := old_event;
  else
    p := v.sync_payload;
    if p is null or p->>'meeting_type' not in ('presencial','online') then raise exception 'Dados do convite inválidos.'; end if;
    select jsonb_build_array(jsonb_build_object('name',pr.full_name,'email',pr.email,'role','REQ-PARTICIPANT'))
      into new_people from public.profiles pr where pr.id=v.organizer_user_id and pr.active;
    new_event := jsonb_build_object('event_uid',v.calendar_uid,'title','UniConecta | ' || (p->>'title') || ' | ' || (p->>'company_name'),
      'start_at',p->>'start_at','end_at',p->>'end_at','sequence',v.revision,'organizer',sender,'attendees',new_people,
      'location',case when p->>'meeting_type'='online' then p->>'meeting_url' else p->>'location' end,
      'description',concat('Empresa: ',p->>'company_name',E'\nResponsável: ',p->>'contact_name',E'\nConsultor: ',p->>'organizer_name',
        ' (',p->>'organizer_email',')',E'\n\nPauta:\n',p->>'description',
        case when p->>'meeting_type'='online' then E'\n\nLink da reunião: ' || (p->>'meeting_url') else '' end,
        E'\n\nAceite ou recuse no seu aplicativo de calendário. O aceite não é registrado automaticamente no CRM.'));
    -- Removed recipients receive a cancellation with the SAME event identity.
    for person in select x from jsonb_array_elements(old_people) x where not exists
      (select 1 from jsonb_array_elements(new_people) n where n->>'email'=x->>'email') loop
      insert into public.calendar_invite_jobs(meeting_activity_id,operation,event_sequence,idempotency_key,payload)
      values(p_id,'CANCEL',v.revision,p_id::text || ':EMAIL:' || v.revision || ':CANCEL:' || (person->>'email'),
        (old_event || jsonb_build_object('attendees',jsonb_build_array(person))) || jsonb_build_object('recipient',person))
      on conflict(idempotency_key) do nothing;
    end loop;
  end if;
  for person in select x from jsonb_array_elements(new_people) x loop
    insert into public.calendar_invite_jobs(meeting_activity_id,operation,event_sequence,idempotency_key,payload)
    values(p_id,operation,v.revision,p_id::text || ':EMAIL:' || v.revision || ':' || operation || ':' || (person->>'email'),
      new_event || jsonb_build_object('recipient',person)) on conflict(idempotency_key) do nothing;
  end loop;
  if operation='REQUEST' then
    update public.activities set contact_id=nullif(p->>'contact_id','')::uuid,contato=p->>'contact_name',contact_email=p->>'contact_email',
      title=p->>'title',description=p->>'description',observacao=p->>'description',meeting_type=p->>'meeting_type',
      tipo=case when p->>'meeting_type'='online' then 'Reunião on-line' else 'Reunião presencial' end,
      data=(p->>'date')::date,start_at=(p->>'start_at')::timestamptz,end_at=(p->>'end_at')::timestamptz,
      location=p->>'location',meeting_url=nullif(p->>'meeting_url',''),status='agendada',meeting_rsvp='[]',
      organizer_name=p->>'organizer_name',organizer_email=p->>'organizer_email'
    where id=p_id;
    delete from public.activity_participants where activity_id=p_id;
    insert into public.activity_participants(activity_id,name,email)
      select p_id,x->>'name',x->>'email' from jsonb_array_elements(p->'participants') x;
  end if;
  update public.activities set calendar_organizer_email=sender,email_queued_revision=revision,
    sync_status='pending',sync_error=null,updated_at=now() where id=p_id;
end $$;


create or replace function public.b2b_stage_meeting(p_id uuid, p_actor uuid, p_revision integer, p_operation text, p_payload jsonb)
returns public.activities language plpgsql security invoker set search_path = '' as $$
declare v public.activities;
begin
  if p_operation not in ('create','update','cancel') then raise exception 'Operação inválida.'; end if;
  if p_operation='create' then
    insert into public.activities(id,company_id,organizer_user_id,organizer_name,organizer_email,
      contact_id,contato,contact_email,consultor,primary_owner_id,data,tipo,status,conta_meta_semanal,
      meeting_type,title,description,observacao,start_at,end_at,location,revision,sync_status,sync_operation,sync_payload,calendar_provider,meeting_url)
    values(p_id,(p_payload->>'company_id')::uuid,p_actor,p_payload->>'organizer_name',p_payload->>'organizer_email',
      nullif(p_payload->>'contact_id','')::uuid,p_payload->>'contact_name',p_payload->>'contact_email',p_payload->>'organizer_name',p_actor,
      (p_payload->>'date')::date,'Reunião','agendada',false,p_payload->>'meeting_type',p_payload->>'title',
      p_payload->>'description',p_payload->>'description',(p_payload->>'start_at')::timestamptz,
      (p_payload->>'end_at')::timestamptz,p_payload->>'location',1,'pending','create',p_payload,coalesce(p_payload->>'calendar_provider','graph'),nullif(p_payload->>'meeting_url',''))
    on conflict(id) do nothing;
  end if;
  select * into v from public.activities where id=p_id for update;
  if not found or v.organizer_user_id is distinct from p_actor or v.meeting_type is null then
    raise exception 'Reunião não encontrada ou organizador inválido.'; end if;
  if p_operation='create' then
    if v.revision<>1 or v.sync_payload is distinct from p_payload then
      raise exception 'Este agendamento já foi registrado. Atualize a ficha.'; end if;
    if v.calendar_provider='email' then
      insert into public.activity_participants(activity_id,name,email)
        select p_id,x->>'name',x->>'email' from jsonb_array_elements(p_payload->'participants') x
        on conflict(activity_id,email) do nothing;
    end if;
    if v.calendar_provider='email' and nullif(p_payload->>'email_sender','') is not null then
      perform public.b2b_queue_email_meeting(p_id,p_payload->>'email_sender');
      select * into v from public.activities where id=p_id;
    end if;
    return v;
  end if;
  if p_operation='update' and coalesce(p_payload->>'calendar_provider',v.calendar_provider)<>v.calendar_provider then raise exception 'A forma de envio não pode ser alterada.'; end if;
  if v.revision<>p_revision then raise exception 'A reunião foi alterada. Atualize a ficha antes de editar.'; end if;
  if p_operation='cancel' and v.calendar_provider='email' and v.email_queued_revision=0 then
    update public.activities set status='cancelada',sync_status='synced',sync_operation=null,sync_payload=null,
      sync_error=null,revision=revision+1,updated_at=now() where id=p_id returning * into v;
    return v;
  end if;
  if v.sync_status = 'syncing' then raise exception 'Conclua a sincronização pendente antes de alterar a reunião.'; end if;
  if v.status in ('cancelada','realizada','nao_compareceu') then raise exception 'Esta reunião já foi encerrada.'; end if;
  update public.activities set sync_operation=p_operation,sync_payload=p_payload,sync_status='pending',sync_error=null,
    revision=revision+1,updated_at=now() where id=p_id returning * into v;
  if v.calendar_provider='email' then
    if p_operation='cancel' then
      update public.activities set status='cancelada' where id=p_id;
    else
      update public.activities set start_at=(p_payload->>'start_at')::timestamptz,end_at=(p_payload->>'end_at')::timestamptz,
        data=(p_payload->>'date')::date,title=p_payload->>'title',description=p_payload->>'description',
        location=p_payload->>'location',meeting_url=nullif(p_payload->>'meeting_url','') where id=p_id;
    end if;
    if nullif(coalesce(v.calendar_organizer_email,p_payload->>'email_sender'),'') is not null then
      perform public.b2b_queue_email_meeting(p_id,coalesce(v.calendar_organizer_email,p_payload->>'email_sender'));
    end if;
    select * into v from public.activities where id=p_id;
  end if;
  return v;
end $$;



-- New email meetings invite only the CRM responsible, never company contacts.
-- Existing job payloads are preserved; the worker verifies recipients against profiles.
commit;
