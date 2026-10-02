-- Acompanhamento compartilhado por escola + edição. Nenhuma edição é deduzida pela data.
create schema if not exists private;
grant usage on schema private to authenticated;

alter table public.supervest_cycles add column capture_academic_year integer
  check (capture_academic_year between 1900 and 2200);
alter table public.supervest_cycles add column is_active boolean not null default false;
create unique index supervest_one_active_capture on public.supervest_cycles(is_active) where is_active;
-- A edição já configurada em captação é inequívoca somente quando existe uma única.
update public.supervest_cycles set is_active=true
where status='captacao' and (select count(*) from public.supervest_cycles where status='captacao')=1;

alter table public.schools add column offered_grades text[];
comment on column public.schools.offered_grades is 'NULL: confirmar séries; array: séries institucionalmente confirmadas. Não representa propriedade da escola.';
alter table public.school_actions add column location text;
alter table public.school_actions add column school_contact_id uuid references public.school_contacts(id);
alter table public.school_actions add column target_grades text[];
alter table public.school_actions add column class_details text;
alter table public.school_actions add column capture_publicity boolean not null default false;
alter table public.school_actions add column results_recorded_at timestamptz;
alter table public.school_actions add column results_recorded_by uuid references public.profiles(id) on delete set null;
alter table public.school_actions add column primary_owner_name text;
alter table public.school_action_participants add column user_name text;
alter table public.school_actions add constraint school_action_supervest_fk foreign key(supervest_cycle_id) references public.supervest_cycles(id);
alter table public.school_action_grade_results add column pending_registrations integer not null default 0 check(pending_registrations>=0);
create unique index school_action_one_grade_result on public.school_action_grade_results(school_action_id,grade);
create index school_actions_cycle_school_date on public.school_actions(supervest_cycle_id,school_id,action_date);
create index school_actions_contact_idx on public.school_actions(school_contact_id);
create index school_actions_result_author_idx on public.school_actions(results_recorded_by);

create table public.school_campaigns(
  school_id uuid not null references public.schools(id),
  supervest_cycle_id uuid not null references public.supervest_cycles(id),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(school_id,supervest_cycle_id)
);
-- Somente vínculos explícitos preexistentes podem originar um acompanhamento.
insert into public.school_campaigns(school_id,supervest_cycle_id,created_by)
select distinct school_id,supervest_cycle_id,created_by from public.school_actions
where supervest_cycle_id is not null on conflict do nothing;
alter table public.school_actions add constraint school_action_campaign_fk
  foreign key(school_id,supervest_cycle_id) references public.school_campaigns(school_id,supervest_cycle_id);

create table public.school_campaign_engagements(
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  supervest_cycle_id uuid not null,
  user_id uuid references public.profiles(id) on delete set null,
  user_name text not null default '',
  status text not null default 'em_contato' check(status in ('em_contato','em_negociacao','aguardando_retorno','agendamento_conjunto','encerrada')),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  closed_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  foreign key(school_id,supervest_cycle_id) references public.school_campaigns(school_id,supervest_cycle_id),
  check((status='encerrada')=(ended_at is not null))
);
create unique index school_campaign_one_open_engagement on public.school_campaign_engagements(school_id,supervest_cycle_id,user_id) where ended_at is null;
create index school_campaign_engagement_cycle_idx on public.school_campaign_engagements(supervest_cycle_id,school_id,updated_at desc);
create index school_campaign_engagement_user_idx on public.school_campaign_engagements(user_id);
create index school_campaign_engagement_creator_idx on public.school_campaign_engagements(created_by);
create index school_campaign_engagement_closer_idx on public.school_campaign_engagements(closed_by);

create table public.school_campaign_contacts(
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  supervest_cycle_id uuid not null,
  institutional_contact_id uuid references public.school_contacts(id),
  consultant_id uuid references public.profiles(id) on delete set null,
  consultant_name text not null default '',
  occurred_at timestamptz not null check(isfinite(occurred_at)),
  person_name text not null check(length(trim(person_name)) between 1 and 200),
  person_role text,
  channel text not null check(channel in ('Ligação','WhatsApp','E-mail','Visita','Outro')),
  description text not null check(length(trim(description)) between 1 and 5000),
  response text,
  negotiation_status text not null check(negotiation_status in ('em_contato','em_negociacao','aguardando_retorno','agendamento_conjunto')),
  next_step text,
  return_at timestamptz check(isfinite(return_at)),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key(school_id,supervest_cycle_id) references public.school_campaigns(school_id,supervest_cycle_id),
  check(return_at is null or nullif(trim(next_step),'') is not null)
);
create index school_campaign_contacts_cycle_idx on public.school_campaign_contacts(supervest_cycle_id,school_id,occurred_at desc);
create index school_campaign_contacts_consultant_idx on public.school_campaign_contacts(consultant_id);
create index school_campaign_contacts_person_idx on public.school_campaign_contacts(institutional_contact_id);
create index school_campaign_contacts_creator_idx on public.school_campaign_contacts(created_by);

create table public.school_campaign_history(
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  supervest_cycle_id uuid references public.supervest_cycles(id),
  entity text not null,
  operation text not null,
  record_id uuid,
  before_data jsonb,
  after_data jsonb,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null,
  recorded_at timestamptz not null default now()
);
create index school_campaign_history_cycle_idx on public.school_campaign_history(supervest_cycle_id,school_id,recorded_at desc);
create index school_campaign_history_actor_idx on public.school_campaign_history(actor_id);

create function private.school_capture_allowed() returns boolean language sql stable security invoker set search_path=''
as $$select exists(select 1 from public.profiles where id=(select auth.uid()) and active and role in ('gerente','supervisor','high_school','consultor_b2b','consultor'))$$;
create function private.school_capture_manager() returns boolean language sql stable security invoker set search_path=''
as $$select exists(select 1 from public.profiles where id=(select auth.uid()) and active and role in ('gerente','supervisor'))$$;
create function private.school_capture_user_name(p_id uuid) returns text language sql stable security invoker set search_path=''
as $$select coalesce(nullif(initcap(replace(consultant_tag,'-',' ')),''),full_name) from public.profiles where id=p_id and active and role in ('gerente','supervisor','high_school','consultor_b2b','consultor')$$;
create function private.school_capture_action_editor(p_id uuid) returns boolean language sql stable security invoker set search_path=''
as $$select private.school_capture_allowed() and exists(select 1 from public.school_actions a where a.id=p_id and a.supervest_cycle_id is not null and
  (private.school_capture_manager() or public.is_high_school_writer() or a.created_by=(select auth.uid()) or a.primary_owner_id=(select auth.uid()) or
    exists(select 1 from public.school_action_participants p where p.school_action_id=a.id and p.user_id=(select auth.uid()))))$$;
revoke all on function private.school_capture_allowed(),private.school_capture_manager(),private.school_capture_user_name(uuid),private.school_capture_action_editor(uuid) from public,anon;
grant execute on function private.school_capture_allowed(),private.school_capture_manager(),private.school_capture_user_name(uuid),private.school_capture_action_editor(uuid) to authenticated;

alter table public.school_campaigns enable row level security;
alter table public.school_campaign_contacts enable row level security;
alter table public.school_campaign_engagements enable row level security;
alter table public.school_campaign_history enable row level security;
revoke all on public.school_campaigns,public.school_campaign_contacts,public.school_campaign_engagements,public.school_campaign_history from anon,authenticated;
grant select,insert on public.school_campaigns,public.school_campaign_contacts to authenticated;
grant select,insert,update on public.school_campaign_engagements to authenticated;
grant select on public.school_campaign_history to authenticated;
grant all on public.school_campaigns,public.school_campaign_contacts,public.school_campaign_engagements,public.school_campaign_history to service_role;
create policy school_campaign_read on public.school_campaigns for select to authenticated using((select private.school_capture_allowed()));
create policy school_campaign_create on public.school_campaigns for insert to authenticated with check((select private.school_capture_allowed()) and created_by=(select auth.uid()));
create policy school_campaign_contacts_read on public.school_campaign_contacts for select to authenticated using((select private.school_capture_allowed()));
create policy school_campaign_contacts_create on public.school_campaign_contacts for insert to authenticated with check((select private.school_capture_allowed()) and consultant_id=(select auth.uid()) and created_by=(select auth.uid()));
create policy school_campaign_engagement_read on public.school_campaign_engagements for select to authenticated using((select private.school_capture_allowed()));
create policy school_campaign_engagement_create on public.school_campaign_engagements for insert to authenticated with check((select private.school_capture_allowed()) and created_by=(select auth.uid()));
create policy school_campaign_engagement_update on public.school_campaign_engagements for update to authenticated
using((select private.school_capture_allowed()) and (user_id=(select auth.uid()) or created_by=(select auth.uid()) or (select private.school_capture_manager())))
with check((select private.school_capture_allowed()) and (user_id=(select auth.uid()) or created_by=(select auth.uid()) or (select private.school_capture_manager())));
create policy school_campaign_history_read on public.school_campaign_history for select to authenticated using((select private.school_capture_allowed()));

-- A permissão de captação compartilhada não dá edição do cadastro institucional.
create policy school_capture_action_insert on public.school_actions for insert to authenticated
with check((select private.school_capture_allowed()) and supervest_cycle_id is not null and created_by=(select auth.uid()));
create policy school_capture_action_update on public.school_actions for update to authenticated
using((select private.school_capture_allowed()) and supervest_cycle_id is not null and (created_by=(select auth.uid()) or primary_owner_id=(select auth.uid()) or (select private.school_capture_manager()) or exists(select 1 from public.school_action_participants p where p.school_action_id=school_actions.id and p.user_id=(select auth.uid()))))
with check((select private.school_capture_allowed()) and supervest_cycle_id is not null and (created_by=(select auth.uid()) or primary_owner_id=(select auth.uid()) or (select private.school_capture_manager()) or exists(select 1 from public.school_action_participants p where p.school_action_id=school_actions.id and p.user_id=(select auth.uid()))));
create policy school_capture_participant_insert on public.school_action_participants for insert to authenticated with check(private.school_capture_action_editor(school_action_id));
create policy school_capture_participant_delete on public.school_action_participants for delete to authenticated using(private.school_capture_action_editor(school_action_id));
create policy school_capture_result_insert on public.school_action_grade_results for insert to authenticated with check(private.school_capture_action_editor(school_action_id));
create policy school_capture_result_update on public.school_action_grade_results for update to authenticated using(private.school_capture_action_editor(school_action_id)) with check(private.school_capture_action_editor(school_action_id));

create function private.stamp_school_capture_record() returns trigger language plpgsql security invoker set search_path=''
as $$declare actor uuid:=auth.uid(); name text; begin
  if actor is null then
    if tg_table_name='school_campaign_engagements' and tg_op='UPDATE' and new.user_id is null then new.status:='encerrada'; new.ended_at:=coalesce(old.ended_at,now()); end if;
    return new;
  end if;
  if not private.school_capture_allowed() then raise exception 'Acesso à captação não autorizado.'; end if;
  if tg_op='INSERT' then new.created_by:=actor; end if;
  if tg_table_name='school_campaigns' then new.created_at:=now();
  elsif tg_table_name='school_campaign_contacts' then
    new.consultant_id:=actor; new.consultant_name:=private.school_capture_user_name(actor); new.created_at:=now();
    if new.institutional_contact_id is not null and not exists(select 1 from public.school_contacts where id=new.institutional_contact_id and school_id=new.school_id) then raise exception 'Contato não pertence a esta escola.'; end if;
  elsif tg_table_name='school_campaign_engagements' then
    name:=private.school_capture_user_name(new.user_id);
    if name is null and tg_op='INSERT' then raise exception 'Participante precisa ser um usuário ativo do CRM.'; end if;
    name:=coalesce(name,old.user_name);
    if tg_op='UPDATE' then
      if (new.school_id,new.supervest_cycle_id,new.user_id) is distinct from (old.school_id,old.supervest_cycle_id,old.user_id) then raise exception 'Escola, edição e consultor da atuação não podem ser alterados.'; end if;
      if old.ended_at is not null then raise exception 'Atuação encerrada: inicie uma nova atuação.'; end if;
      new.created_by:=old.created_by; new.started_at:=old.started_at;
    else new.started_at:=now(); end if;
    new.user_name:=name; new.updated_at:=now();
    if new.status='encerrada' then new.ended_at:=now(); new.closed_by:=actor; else new.ended_at:=null; new.closed_by:=null; end if;
  end if;
  return new;
end$$;
revoke all on function private.stamp_school_capture_record() from public,anon;
grant execute on function private.stamp_school_capture_record() to authenticated;
create trigger stamp_school_campaign before insert on public.school_campaigns for each row execute function private.stamp_school_capture_record();
create trigger stamp_school_campaign_contact before insert on public.school_campaign_contacts for each row execute function private.stamp_school_capture_record();
create trigger stamp_school_campaign_engagement before insert or update on public.school_campaign_engagements for each row execute function private.stamp_school_capture_record();

create function private.guard_school_capture_action() returns trigger language plpgsql security invoker set search_path=''
as $$begin
  if auth.uid() is null then return coalesce(new,old); end if;
  if tg_op='DELETE' then
    if old.supervest_cycle_id is not null then raise exception 'Preserve o histórico: cancele a ação em vez de excluí-la.'; end if; return old;
  end if;
  if tg_op='UPDATE' then
    if old.supervest_cycle_id is not null and (new.school_id,new.supervest_cycle_id) is distinct from (old.school_id,old.supervest_cycle_id) then raise exception 'Uma ação não pode ser transferida entre escolas ou edições.'; end if;
    if old.supervest_cycle_id is null and new.supervest_cycle_id is not null and not private.school_capture_manager() then raise exception 'Somente a gestão pode vincular uma ação antiga à edição.'; end if;
    new.created_by:=old.created_by; new.created_at:=old.created_at;
  else new.created_by:=auth.uid(); new.created_at:=now(); end if;
  if new.supervest_cycle_id is not null then
    if not private.school_capture_allowed() then raise exception 'Acesso não autorizado.'; end if;
    insert into public.school_campaigns(school_id,supervest_cycle_id,created_by) values(new.school_id,new.supervest_cycle_id,auth.uid()) on conflict do nothing;
    if new.school_contact_id is not null and not exists(select 1 from public.school_contacts where id=new.school_contact_id and school_id=new.school_id) then raise exception 'Contato não pertence a esta escola.'; end if;
    if new.primary_owner_id is not null and (tg_op='INSERT' or new.primary_owner_id is distinct from old.primary_owner_id) and private.school_capture_user_name(new.primary_owner_id) is null then raise exception 'Consultor principal inválido ou inativo.'; end if;
    new.primary_owner_name:=coalesce(private.school_capture_user_name(new.primary_owner_id),case when tg_op='UPDATE' then old.primary_owner_name end);
    if new.target_grades is not null and exists(select 1 from unnest(new.target_grades) g where not exists(select 1 from public.grade_levels where code=g)) then raise exception 'Série inválida.'; end if;
    if new.start_time is not null and new.end_time is not null and new.end_time<=new.start_time then raise exception 'Horário final deve ser posterior ao inicial.'; end if;
    if new.results_recorded_at is not null and (tg_op='INSERT' or new.results_recorded_at is distinct from old.results_recorded_at) then new.results_recorded_at:=now(); new.results_recorded_by:=auth.uid();
    elsif tg_op='UPDATE' then new.results_recorded_at:=old.results_recorded_at; new.results_recorded_by:=old.results_recorded_by; end if;
  end if;
  return new;
end$$;
revoke all on function private.guard_school_capture_action() from public,anon;
grant execute on function private.guard_school_capture_action() to authenticated;
create trigger guard_school_capture_action before insert or update or delete on public.school_actions for each row execute function private.guard_school_capture_action();

create function private.stamp_school_capture_participant() returns trigger language plpgsql security invoker set search_path=''
as $$begin
  if auth.uid() is null then return new; end if;
  if not public.is_high_school_writer() and not private.school_capture_action_editor(new.school_action_id) then raise exception 'Participação não autorizada.'; end if;
  if tg_op='UPDATE' and (new.school_action_id,new.user_id) is distinct from (old.school_action_id,old.user_id) then raise exception 'Crie uma nova participação para outro usuário ou ação.'; end if;
  new.user_name:=coalesce(private.school_capture_user_name(new.user_id),case when tg_op='UPDATE' then old.user_name end);
  if new.user_name is null then raise exception 'Participante inválido ou inativo.'; end if;
  return new;
end$$;
revoke all on function private.stamp_school_capture_participant() from public,anon;
grant execute on function private.stamp_school_capture_participant() to authenticated;
create trigger stamp_school_capture_participant before insert or update on public.school_action_participants for each row execute function private.stamp_school_capture_participant();

create function private.guard_school_capture_result() returns trigger language plpgsql security invoker set search_path=''
as $$declare linked boolean; action_status text; begin
  if auth.uid() is null then return coalesce(new,old); end if;
  select supervest_cycle_id is not null,status into linked,action_status from public.school_actions where id=case when tg_op='INSERT' then new.school_action_id else old.school_action_id end;
  if not coalesce(linked,false) then return coalesce(new,old); end if;
  if tg_op='DELETE' then raise exception 'Preserve o resultado: corrija as quantidades em vez de excluí-lo.'; end if;
  if tg_op='UPDATE' and (new.school_action_id,new.grade) is distinct from (old.school_action_id,old.grade) then raise exception 'O resultado não pode ser transferido para outra ação ou série.'; end if;
  if action_status<>'realizada' then raise exception 'Registre a realização da ação antes do resultado.'; end if;
  if coalesce(new.leads,-1)<0 or coalesce(new.pending_registrations,-1)<0 or coalesce(new.supervest_registrations,-1)<0 or coalesce(new.estimated_impacted,0)<0 or coalesce(new.classes_count,0)<0 then raise exception 'Resultados devem ser quantidades não negativas.'; end if;
  return new;
end$$;
revoke all on function private.guard_school_capture_result() from public,anon;
grant execute on function private.guard_school_capture_result() to authenticated;
create trigger guard_school_capture_result before insert or update or delete on public.school_action_grade_results for each row execute function private.guard_school_capture_result();

-- Escrita privilegiada apenas para o log imutável interno. Não exposta pela Data API.
create function private.audit_school_capture() returns trigger language plpgsql security definer set search_path=''
as $$declare row_data jsonb; previous_data jsonb; school uuid; cycle uuid; record uuid; actor uuid:=auth.uid(); actor_label text; begin
  if actor is null then return coalesce(new,old); end if;
  actor_label:=private.school_capture_user_name(actor);
  if actor_label is null then raise exception 'Autor inválido para o histórico.'; end if;
  if tg_op<>'DELETE' then row_data:=to_jsonb(new); end if;
  if tg_op<>'INSERT' then previous_data:=to_jsonb(old); end if;
  school:=coalesce(row_data->>'school_id',previous_data->>'school_id')::uuid;
  cycle:=coalesce(row_data->>'supervest_cycle_id',previous_data->>'supervest_cycle_id')::uuid;
  record:=coalesce(row_data->>'id',previous_data->>'id')::uuid;
  if tg_table_name='schools' then school:=record; end if;
  if tg_table_name in ('school_action_participants','school_action_grade_results') then
    select school_id,supervest_cycle_id into school,cycle from public.school_actions where id=coalesce(row_data->>'school_action_id',previous_data->>'school_action_id')::uuid;
  end if;
  if school is null then return coalesce(new,old); end if;
  insert into public.school_campaign_history(school_id,supervest_cycle_id,entity,operation,record_id,before_data,after_data,actor_id,actor_name)
  values(school,cycle,tg_table_name,tg_op,record,previous_data,row_data,actor,actor_label);
  return coalesce(new,old);
end$$;
revoke all on function private.audit_school_capture() from public,anon,authenticated;
create trigger audit_school_offered_grades after update of offered_grades on public.schools for each row when (old.offered_grades is distinct from new.offered_grades) execute function private.audit_school_capture();
create trigger audit_school_campaign_contact after insert on public.school_campaign_contacts for each row execute function private.audit_school_capture();
create trigger audit_school_campaign_engagement after insert or update on public.school_campaign_engagements for each row execute function private.audit_school_capture();
create trigger audit_school_capture_action after insert or update or delete on public.school_actions for each row execute function private.audit_school_capture();
create trigger audit_school_capture_participant after insert or update or delete on public.school_action_participants for each row execute function private.audit_school_capture();
create trigger audit_school_capture_result after insert or update or delete on public.school_action_grade_results for each row execute function private.audit_school_capture();

-- Uma chamada é uma transação: contato/atuações e ação/participantes não ficam pela metade.
create function public.save_school_capture(p_school_id uuid,p_cycle_id uuid,p_command text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=''
as $$declare actor uuid:=auth.uid(); uid uuid; rec uuid; person uuid; action_row public.school_actions%rowtype; e public.school_campaign_engagements%rowtype; item jsonb; users uuid[]; grades text[]; name text; current_school public.schools%rowtype; stat text; occur timestamptz; begin
  if not private.school_capture_allowed() then raise exception 'Acesso à captação não autorizado.'; end if;
  if jsonb_typeof(p_payload)<>'object' then raise exception 'Formulário inválido.'; end if;
  select * into current_school from public.schools where id=p_school_id;
  if not found or not exists(select 1 from public.supervest_cycles where id=p_cycle_id) then raise exception 'Escola ou edição não encontrada.'; end if;
  if (p_command in ('start','contact') or (p_command='action' and nullif(p_payload->>'id','') is null)) and current_school.offered_grades is not null and not ('em3'=any(current_school.offered_grades)) then raise exception 'Confirme o 3º ano no cadastro antes de iniciar uma nova captação.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||p_cycle_id::text,0));
  insert into public.school_campaigns(school_id,supervest_cycle_id,created_by) values(p_school_id,p_cycle_id,actor) on conflict do nothing;

  if p_command in ('start','contact') then
    stat:=coalesce(nullif(p_payload->>'status',''),'em_contato');
    if stat not in ('em_contato','em_negociacao','aguardando_retorno','agendamento_conjunto') then raise exception 'Situação de negociação inválida.'; end if;
    select coalesce(array_agg(distinct v::uuid),'{}'::uuid[]) into users from jsonb_array_elements_text(coalesce(p_payload->'support_ids','[]')) v;
    users:=array_append(users,actor);
    foreach uid in array users loop
      name:=private.school_capture_user_name(uid);
      if name is null then raise exception 'Participante inválido ou inativo.'; end if;
      select * into e from public.school_campaign_engagements where school_id=p_school_id and supervest_cycle_id=p_cycle_id and user_id=uid and ended_at is null;
      if not found then
        insert into public.school_campaign_engagements(school_id,supervest_cycle_id,user_id,status,created_by) values(p_school_id,p_cycle_id,uid,stat,actor);
      elsif uid=actor or e.created_by=actor or private.school_capture_manager() then
        update public.school_campaign_engagements set status=stat where id=e.id;
      end if;
    end loop;
    if p_command='contact' then
      rec:=coalesce(nullif(p_payload->>'id','')::uuid,gen_random_uuid());
      occur:=(p_payload->>'occurred_at')::timestamptz;
      insert into public.school_campaign_contacts(id,school_id,supervest_cycle_id,institutional_contact_id,consultant_id,occurred_at,person_name,person_role,channel,description,response,negotiation_status,next_step,return_at,created_by)
      values(rec,p_school_id,p_cycle_id,nullif(p_payload->>'contact_id','')::uuid,actor,occur,p_payload->>'person_name',nullif(p_payload->>'person_role',''),p_payload->>'channel',p_payload->>'description',nullif(p_payload->>'response',''),stat,nullif(p_payload->>'next_step',''),nullif(p_payload->>'return_at','')::timestamptz,actor)
      on conflict(id) do nothing;
      if not exists(select 1 from public.school_campaign_contacts where id=rec and school_id=p_school_id and supervest_cycle_id=p_cycle_id and created_by=actor) then raise exception 'Registro de contato inválido.'; end if;
    end if;
  elsif p_command='close' then
    rec:=(p_payload->>'id')::uuid;
    update public.school_campaign_engagements set status='encerrada' where id=rec and school_id=p_school_id and supervest_cycle_id=p_cycle_id and ended_at is null;
    if not found then raise exception 'Atuação não encontrada ou sem permissão para encerrar.'; end if;
  elsif p_command='associate' then
    if not private.school_capture_manager() then raise exception 'Somente a gestão pode associar registros antigos.'; end if;
    rec:=(p_payload->>'id')::uuid;
    update public.school_actions set supervest_cycle_id=p_cycle_id,capture_publicity=coalesce((p_payload->>'publicity')::boolean,false) where id=rec and school_id=p_school_id and supervest_cycle_id is null;
    if not found then raise exception 'Ação antiga não encontrada ou já vinculada.'; end if;
  elsif p_command in ('action','result') then
    rec:=nullif(p_payload->>'id','')::uuid;
    if rec is not null then
      select * into action_row from public.school_actions where id=rec and school_id=p_school_id and supervest_cycle_id=p_cycle_id for update;
      if not found or not private.school_capture_action_editor(rec) then raise exception 'Ação não pertence a esta escola/edição ou edição não autorizada.'; end if;
    elsif p_command='result' then raise exception 'Selecione a ação realizada.';
    end if;
    if p_command='action' then
      stat:=coalesce(p_payload->>'status','agendada');
      if stat not in ('agendada','confirmada','realizada','cancelada','reagendada') then raise exception 'Situação da ação inválida.'; end if;
      if coalesce(p_payload->>'action_type','') not in ('Visita de relacionamento','Reunião com direção','Reunião com coordenação','Palestra de profissões','Feira de profissões','Sala a sala','Intervalo','Orientação profissional','Café com os Pais','Simulado','Entrega de material','Divulgação SuperVestibular','Ação de captação','Outra') then raise exception 'Tipo de ação inválido.'; end if;
      if nullif(btrim(p_payload->>'objective'),'') is null or nullif(btrim(p_payload->>'location'),'') is null then raise exception 'Informe o objetivo e o local da ação.'; end if;
      uid:=(p_payload->>'primary_user_id')::uuid;
      if private.school_capture_user_name(uid) is null and (rec is null or uid is distinct from action_row.primary_owner_id) then raise exception 'Consultor principal inválido.'; end if;
      if nullif(p_payload->>'start_time','') is null or nullif(p_payload->>'end_time','') is null then raise exception 'Informe os horários inicial e final.'; end if;
      if coalesce((p_payload->>'estimated_students')::int,0)<0 or coalesce((p_payload->>'estimated_classes')::int,0)<0 then raise exception 'Estimativas não podem ser negativas.'; end if;
      select coalesce(array_agg(v),'{}') into grades from jsonb_array_elements_text(coalesce(p_payload->'target_grades','[]')) v;
      if cardinality(grades)=0 then raise exception 'Selecione as séries envolvidas na ação.'; end if;
      if rec is null then
        insert into public.school_actions(school_id,supervest_cycle_id,action_date,start_time,end_time,action_type,objective,status,primary_owner_id,school_contact_id,location,target_grades,class_details,estimated_students,estimated_classes,notes,created_by,capture_publicity)
        values(p_school_id,p_cycle_id,(p_payload->>'action_date')::date,(p_payload->>'start_time')::time,(p_payload->>'end_time')::time,p_payload->>'action_type',nullif(p_payload->>'objective',''),stat,uid,nullif(p_payload->>'contact_id','')::uuid,nullif(p_payload->>'location',''),grades,nullif(p_payload->>'class_details',''),nullif(p_payload->>'estimated_students','')::int,nullif(p_payload->>'estimated_classes','')::int,nullif(p_payload->>'notes',''),actor,true) returning id into rec;
      else
        update public.school_actions set action_date=(p_payload->>'action_date')::date,start_time=(p_payload->>'start_time')::time,end_time=(p_payload->>'end_time')::time,action_type=p_payload->>'action_type',objective=nullif(p_payload->>'objective',''),status=stat,primary_owner_id=uid,school_contact_id=nullif(p_payload->>'contact_id','')::uuid,location=nullif(p_payload->>'location',''),target_grades=grades,class_details=nullif(p_payload->>'class_details',''),estimated_students=nullif(p_payload->>'estimated_students','')::int,estimated_classes=nullif(p_payload->>'estimated_classes','')::int,notes=nullif(p_payload->>'notes','') where id=rec;
      end if;
      select coalesce(array_agg(distinct v::uuid),'{}'::uuid[]) into users from jsonb_array_elements_text(coalesce(p_payload->'support_ids','[]')) v;
      users:=array_remove(users,uid);
      foreach person in array users loop if private.school_capture_user_name(person) is null and not exists(select 1 from public.school_action_participants where school_action_id=rec and user_id=person) then raise exception 'Participante inválido ou inativo.'; end if; end loop;
      delete from public.school_action_participants where school_action_id=rec and not (user_id=any(users));
      foreach person in array users loop
        if person<>uid and not exists(select 1 from public.school_action_participants where school_action_id=rec and user_id=person) then insert into public.school_action_participants(school_action_id,user_id,role_in_action) values(rec,person,'Apoio'); end if;
      end loop;
    else
      if action_row.status<>'realizada' then raise exception 'Registre a realização da ação antes do resultado.'; end if;
      if jsonb_array_length(coalesce(p_payload->'results','[]'))=0 then raise exception 'Informe o resultado de pelo menos uma série, inclusive quando for zero.'; end if;
      if exists(select 1 from jsonb_array_elements(p_payload->'results') r group by r->>'grade' having count(*)>1) then raise exception 'Uma série não pode aparecer duas vezes no mesmo resultado.'; end if;
      for item in select value from jsonb_array_elements(p_payload->'results') loop
        if coalesce((item->>'leads')::int,-1)<0 or coalesce((item->>'pending')::int,-1)<0 or coalesce((item->>'registrations')::int,-1)<0 or coalesce((item->>'impacted')::int,0)<0 or coalesce((item->>'classes')::int,0)<0 then raise exception 'Resultados devem ser quantidades inteiras não negativas.'; end if;
        if not exists(select 1 from public.grade_levels where code=item->>'grade' and supervest_eligible) then item:=jsonb_set(jsonb_set(item,'{pending}','0'),'{registrations}','0'); end if;
        insert into public.school_action_grade_results(school_action_id,grade,classes_count,estimated_impacted,leads,supervest_registrations,pending_registrations)
        values(rec,item->>'grade',nullif(item->>'classes','')::int,nullif(item->>'impacted','')::int,(item->>'leads')::int,(item->>'registrations')::int,(item->>'pending')::int)
        on conflict(school_action_id,grade) do update set classes_count=excluded.classes_count,estimated_impacted=excluded.estimated_impacted,leads=excluded.leads,supervest_registrations=excluded.supervest_registrations,pending_registrations=excluded.pending_registrations;
      end loop;
      update public.school_actions set results_recorded_at=now(),results_recorded_by=actor,result_notes=nullif(p_payload->>'notes','') where id=rec;
    end if;
  else raise exception 'Operação de captação inválida.';
  end if;
  return jsonb_build_object('ok',true,'id',rec);
end$$;
revoke all on function public.save_school_capture(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.save_school_capture(uuid,uuid,text,jsonb) to authenticated;

create function public.configure_school_capture_cycle(p_cycle_id uuid,p_year integer,p_start date,p_end date,p_active boolean)
returns void language plpgsql security invoker set search_path=''
as $$begin
  if not public.is_high_school_writer() then raise exception 'Você não tem permissão para configurar edições.'; end if;
  if p_year not between 1900 and 2200 or p_year is null then raise exception 'Informe o ano letivo da divulgação.'; end if;
  if p_start is not null and p_end is not null and p_end<p_start then raise exception 'O período de captação é inválido.'; end if;
  if not exists(select 1 from public.supervest_cycles where id=p_cycle_id) then raise exception 'Edição não encontrada.'; end if;
  if p_active then update public.supervest_cycles set is_active=false where is_active; end if;
  update public.supervest_cycles set capture_academic_year=p_year,campaign_start_at=p_start,campaign_end_at=p_end,is_active=p_active,updated_by=auth.uid() where id=p_cycle_id;
end$$;
revoke all on function public.configure_school_capture_cycle(uuid,integer,date,date,boolean) from public,anon;
grant execute on function public.configure_school_capture_cycle(uuid,integer,date,date,boolean) to authenticated;
