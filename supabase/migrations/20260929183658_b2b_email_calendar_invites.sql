-- Extend the existing invite queue; no parallel mail queue or account linking required.
alter table public.activities
  add column calendar_provider text not null default 'graph' check (calendar_provider in ('email','graph')),
  add column calendar_uid text not null default (gen_random_uuid()::text || '@uniconecta'),
  add column calendar_organizer_email text,
  add column meeting_url text,
  add column email_queued_revision integer not null default 0;
alter table public.activities drop constraint activities_meeting_type_check;
alter table public.activities add constraint activities_meeting_type_check check(meeting_type in ('presencial','teams','online'));
create unique index activities_calendar_uid on public.activities(calendar_uid) where meeting_type is not null;

alter table public.calendar_invite_jobs alter column calendar_event_id drop not null;
alter table public.calendar_invite_jobs
  add column meeting_activity_id uuid references public.activities(id) on delete restrict,
  add column payload jsonb,
  add constraint calendar_invite_jobs_one_source check ((calendar_event_id is null) <> (meeting_activity_id is null));
create index calendar_invite_jobs_meeting on public.calendar_invite_jobs(meeting_activity_id,event_sequence) where meeting_activity_id is not null;
create policy calendar_jobs_b2b_insert_backend on public.calendar_invite_jobs as restrictive for insert to authenticated with check(meeting_activity_id is null);
create policy calendar_jobs_b2b_update_backend on public.calendar_invite_jobs as restrictive for update to authenticated using(meeting_activity_id is null) with check(meeting_activity_id is null);
create policy calendar_jobs_b2b_delete_backend on public.calendar_invite_jobs as restrictive for delete to authenticated using(meeting_activity_id is null);

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
      (p_payload->>'contact_id')::uuid,p_payload->>'contact_name',p_payload->>'contact_email',p_payload->>'organizer_name',p_actor,
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
    return v;
  end if;
  if p_operation='update' and coalesce(p_payload->>'calendar_provider',v.calendar_provider)<>v.calendar_provider then raise exception 'A forma de envio não pode ser alterada.'; end if;
  if v.revision<>p_revision then raise exception 'A reunião foi alterada. Atualize a ficha antes de editar.'; end if;
  if p_operation='cancel' and v.calendar_provider='email' and v.email_queued_revision=0 then
    update public.activities set status='cancelada',sync_status='synced',sync_operation=null,sync_payload=null,
      sync_error=null,revision=revision+1,updated_at=now() where id=p_id returning * into v;
    return v;
  end if;
  if v.sync_status <> 'synced' then raise exception 'Conclua a sincronização pendente antes de alterar a reunião.'; end if;
  if v.status in ('cancelada','realizada','nao_compareceu') then raise exception 'Esta reunião já foi encerrada.'; end if;
  update public.activities set sync_operation=p_operation,sync_payload=p_payload,sync_status='pending',sync_error=null,
    revision=revision+1,updated_at=now() where id=p_id returning * into v;
  return v;
end $$;


-- Snapshot each recipient and message in one transaction. Retrying never rebuilds
-- already queued jobs or changes the UID/organizer of an existing invitation.
create function public.b2b_queue_email_meeting(p_id uuid,p_sender text) returns void
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
  select jsonb_build_array(jsonb_build_object('name',v.organizer_name,'email',v.organizer_email,'role','REQ-PARTICIPANT'),
    jsonb_build_object('name',v.contato,'email',v.contact_email,'role','REQ-PARTICIPANT')) ||
    coalesce(jsonb_agg(jsonb_build_object('name',name,'email',email,'role','OPT-PARTICIPANT')),'[]'::jsonb)
    into old_people from public.activity_participants where activity_id=p_id;
  if v.email_queued_revision=0 then old_people := '[]'; end if;
  old_event := jsonb_build_object('event_uid',v.calendar_uid,'title',v.title,'start_at',v.start_at,'end_at',v.end_at,
    'description',v.description,'location',coalesce(v.meeting_url,v.location),'sequence',v.revision,'organizer',sender,'attendees',old_people);
  operation := case when v.sync_operation='cancel' then 'CANCEL' else 'REQUEST' end;
  if operation='CANCEL' then
    new_people := old_people; new_event := old_event;
  else
    p := v.sync_payload;
    if p is null or p->>'meeting_type' not in ('presencial','online') then raise exception 'Dados do convite inválidos.'; end if;
    new_people := jsonb_build_array(jsonb_build_object('name',p->>'organizer_name','email',p->>'organizer_email','role','REQ-PARTICIPANT'),
      jsonb_build_object('name',p->>'contact_name','email',p->>'contact_email','role','REQ-PARTICIPANT')) ||
      coalesce((select jsonb_agg(x || jsonb_build_object('role','OPT-PARTICIPANT')) from jsonb_array_elements(p->'participants') x),'[]'::jsonb);
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
    update public.activities set contact_id=(p->>'contact_id')::uuid,contato=p->>'contact_name',contact_email=p->>'contact_email',
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

create function public.b2b_settle_email_meeting(p_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare v public.activities; total integer; remaining integer; failures integer;
begin
  select * into v from public.activities where id=p_id for update;
  if not found or v.calendar_provider<>'email' or v.sync_status='synced' then return; end if;
  select count(*),count(*) filter(where status<>'sent_provider'),count(*) filter(where status='failed')
    into total,remaining,failures from public.calendar_invite_jobs where meeting_activity_id=p_id and event_sequence=v.revision;
  if total=0 then return; end if;
  if remaining=0 then
    update public.activities set status=case when sync_operation='cancel' then 'cancelada' else status end,
      sync_status='synced',sync_error=null,sync_operation=null,sync_payload=null,updated_at=now() where id=p_id;
  else
    update public.activities set sync_status=case when failures>0 then 'failed' else 'pending' end,
      sync_error=case when failures>0 then 'Existem convites com falha de envio. Tente novamente ou verifique o remetente com a gerência.' else null end,
      updated_at=now() where id=p_id;
  end if;
end $$;

revoke all on function public.b2b_queue_email_meeting(uuid,text) from public,anon,authenticated;
revoke all on function public.b2b_settle_email_meeting(uuid) from public,anon,authenticated;
grant execute on function public.b2b_queue_email_meeting(uuid,text) to service_role;
grant execute on function public.b2b_settle_email_meeting(uuid) to service_role;
