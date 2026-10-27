-- Audited public schema at 0a2bc72, without business or Auth user data.
-- For a NEW isolated Supabase project only; then apply all *_audit_* migrations.
set check_function_bodies=off; create schema if not exists private; create schema if not exists extensions;
create table "public"."profiles" ("id" uuid not null,"full_name" text default ''::text not null,"email" text,"role" text default 'consultor'::text not null,"consultant_tag" text,"active" boolean default true not null,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null,"must_change_password" boolean default false not null,"password_reset_pending" boolean default false not null,"password_reset_operation" uuid,"password_changed_at" timestamp with time zone);
create table "public"."agreements" ("id" uuid default gen_random_uuid() not null,"company_id" uuid not null,"ativo" boolean default true not null,"status" text default 'Ativo'::text,"data_inicio" date,"percentual" integer,"cursos" text,"modalidades" text,"dependentes" text,"contrapartidas" text,"responsavel_assinatura" text,"contrato" text,"ultima_divulgacao" date,"inscricoes" integer,"matriculas_financeiras" integer,"matriculas_academicas" integer,"observacoes" text,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null);
create table "public"."attachments" ("id" uuid default gen_random_uuid() not null,"entity_type" text not null,"entity_id" uuid not null,"storage_path" text not null,"file_name" text not null,"mime_type" text not null,"file_size" bigint,"description" text,"uploaded_by" uuid not null,"created_at" timestamp with time zone default now() not null);
create table "public"."company_contacts" ("id" uuid default gen_random_uuid() not null,"company_id" uuid not null,"nome" text default ''::text not null,"papel" text,"cargo" text,"telefone" text,"email" text,"position" integer default 0 not null,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null,"is_primary" boolean default false not null,"observacoes" text);
create table "public"."app_settings" ("id" integer default 1 not null,"nome_unidade" text,"logo_url" text,"cor_primaria" text,"cor_rail" text,"cor_suave" text,"cor_alerta" text,"cor_atencao" text,"link_base" text,"param_consultor" text default 'consultor'::text,"param_empresa" text default 'empresa'::text,"incluir_empresa" boolean default true,"empresa_chave" text default 'cnpj'::text,"utm" boolean default true,"updated_at" timestamp with time zone default now() not null,"b2b_risk_days" integer default 30 not null,"b2b_critical_days" integer default 15 not null);
create table "public"."school_stage_history" ("id" uuid default gen_random_uuid() not null,"school_id" uuid not null,"previous_stage" text,"new_stage" text not null,"changed_by" uuid,"reason" text,"changed_at" timestamp with time zone default now() not null);
create table "public"."school_owner_history" ("id" uuid default gen_random_uuid() not null,"school_id" uuid not null,"previous_owner_id" uuid,"new_owner_id" uuid,"changed_by" uuid,"reason" text,"changed_at" timestamp with time zone default now() not null);
create table "public"."commercial_cycles" ("id" uuid default gen_random_uuid() not null,"name" text not null,"start_at" date not null,"end_at" date not null,"status" text default 'ativo'::text not null,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null);
create table "public"."supervest_snapshots" ("id" uuid default gen_random_uuid() not null,"cycle_id" uuid not null,"snapshot_date" date not null,"official_registrations" integer default 0 not null,"entered_by" uuid,"notes" text,"created_at" timestamp with time zone default now() not null);
create table "public"."school_contacts" ("id" uuid default gen_random_uuid() not null,"school_id" uuid not null,"name" text not null,"role" text,"phone" text,"whatsapp" text,"email" text,"is_primary" boolean default false not null,"notes" text,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null);
create table "public"."grade_levels" ("code" text not null,"label" text not null,"sort_order" integer default 0 not null,"supervest_eligible" boolean default false not null,"active" boolean default true not null);
create table "public"."school_grade_estimates" ("id" uuid default gen_random_uuid() not null,"school_id" uuid not null,"academic_year" integer not null,"grade" text not null,"estimated_students" integer,"number_of_classes" integer,"updated_by" uuid,"updated_at" timestamp with time zone default now() not null);
create table "public"."route_stops" ("id" uuid default gen_random_uuid() not null,"route_plan_id" uuid not null,"entity_type" text not null,"entity_id" uuid not null,"sort_order" integer not null,"fixed_time" time without time zone,"estimated_arrival" time without time zone,"visit_minutes" integer,"notes" text,"created_at" timestamp with time zone default now() not null);
create table "public"."goal_types" ("code" text not null,"label" text not null,"unit" text default 'un'::text not null,"active" boolean default true not null,"sort_order" integer default 0 not null);
create table "public"."goals" ("id" uuid default gen_random_uuid() not null,"goal_type" text not null,"scope_type" text default 'geral'::text not null,"team_type" text,"user_id" uuid,"commercial_cycle_id" uuid,"supervest_cycle_id" uuid,"target_value" numeric not null,"start_at" date not null,"end_at" date not null,"status" text default 'ativa'::text not null,"notes" text,"created_by" uuid,"updated_by" uuid,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null);
create table "public"."goal_history" ("id" uuid default gen_random_uuid() not null,"goal_id" uuid not null,"field_changed" text not null,"previous_value" text,"new_value" text,"changed_by" uuid,"reason" text,"changed_at" timestamp with time zone default now() not null);
create table "public"."goal_week_exceptions" ("id" uuid default gen_random_uuid() not null,"user_id" uuid not null,"week_start" date not null,"reason" text,"notes" text,"authorized_by" uuid,"created_at" timestamp with time zone default now() not null);
create table "public"."weekly_action_snapshots" ("id" uuid default gen_random_uuid() not null,"user_id" uuid not null,"week_start" date not null,"week_end" date not null,"applied_target" integer not null,"completed_actions" integer default 0 not null,"distinct_companies" integer default 0 not null,"achieved" boolean default false not null,"applicable" boolean default true not null,"exception_reason" text,"closed_at" timestamp with time zone,"created_at" timestamp with time zone default now() not null);
create table "public"."route_user_preferences" ("user_id" uuid not null,"home_logradouro" text,"home_numero" text,"home_complemento" text,"home_bairro" text,"home_cidade" text,"home_cep" text,"home_latitude" double precision,"home_longitude" double precision,"home_geocoded_at" timestamp with time zone,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null);
create table "public"."route_plans" ("id" uuid default gen_random_uuid() not null,"owner_id" uuid not null,"plan_date" date not null,"origin_label" text,"origin_lat" double precision,"origin_lng" double precision,"destination_label" text,"destination_lat" double precision,"destination_lng" double precision,"departure_time" time without time zone,"return_time" time without time zone,"avg_visit_minutes" integer default 45 not null,"status" text default 'rascunho'::text not null,"optimized_at" timestamp with time zone,"total_distance_m" integer,"total_duration_s" integer,"notes" text,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null,"route_name" text);
create table "public"."attendance_team_slots" ("slot_key" text not null,"label" text not null,"sort_order" integer not null,"user_id" uuid,"active" boolean default true not null,"updated_by" uuid,"updated_at" timestamp with time zone default now() not null);
create table "public"."attendance_rotation_template" ("week_index" integer not null,"lane" text not null,"position" integer not null,"slot_key" text not null,"updated_by" uuid,"updated_at" timestamp with time zone default now() not null);
create table "public"."attendance_cycles" ("id" uuid default gen_random_uuid() not null,"name" text not null,"cycle_start" date not null,"period_start" date not null,"period_end" date not null,"status" text default 'draft'::text not null,"created_by" uuid not null,"published_by" uuid,"published_at" timestamp with time zone,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null);
create table "public"."attendance_exceptions" ("exception_date" date not null,"kind" text default 'closed'::text not null,"closed" boolean default true not null,"note" text,"created_by" uuid not null,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null);
create table "public"."attendance_absences" ("id" uuid default gen_random_uuid() not null,"user_id" uuid not null,"absence_date" date not null,"start_time" time without time zone,"end_time" time without time zone,"reason" text,"active" boolean default true not null,"created_by" uuid not null,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null);
create table "public"."attendance_occurrences" ("id" uuid default gen_random_uuid() not null,"cycle_id" uuid,"series_key" text,"template_week_index" integer,"slot_key" text,"user_id" uuid,"activity" text not null,"occurrence_date" date not null,"start_time" time without time zone not null,"end_time" time without time zone not null,"break_start" time without time zone,"break_end" time without time zone,"location" text,"notes" text,"status" text default 'draft'::text not null,"event_uid" text default ((gen_random_uuid())::text || '@uniconecta'::text) not null,"sequence" integer default 0 not null,"created_by" uuid not null,"updated_by" uuid,"published_by" uuid,"published_at" timestamp with time zone,"cancelled_at" timestamp with time zone,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null);
create table "public"."attendance_invite_jobs" ("id" uuid default gen_random_uuid() not null,"occurrence_id" uuid not null,"recipient_user_id" uuid,"operation" text not null,"event_sequence" integer not null,"idempotency_key" text not null,"status" text default 'pending'::text not null,"payload" jsonb not null,"attempts" integer default 0 not null,"provider" text,"provider_message_id" text,"last_error" text,"next_attempt_at" timestamp with time zone,"sent_at" timestamp with time zone,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null);
create table "public"."attendance_occurrence_history" ("id" bigint not null,"occurrence_id" uuid not null,"action" text not null,"changed_by" uuid,"old_values" jsonb,"new_values" jsonb,"created_at" timestamp with time zone default now() not null);
create table "public"."attendance_settings" ("id" smallint default 1 not null,"timezone" text default 'America/Sao_Paulo'::text not null,"weekday_room_open" time without time zone default '09:00:00'::time without time zone not null,"weekday_room_close" time without time zone default '20:00:00'::time without time zone not null,"room_early_start" time without time zone default '09:00:00'::time without time zone not null,"room_early_end" time without time zone default '18:00:00'::time without time zone not null,"room_late_start" time without time zone default '11:00:00'::time without time zone not null,"room_late_end" time without time zone default '20:00:00'::time without time zone not null,"morning_start" time without time zone default '09:00:00'::time without time zone not null,"morning_end" time without time zone default '13:00:00'::time without time zone not null,"afternoon_start" time without time zone default '14:00:00'::time without time zone not null,"afternoon_end" time without time zone default '18:00:00'::time without time zone not null,"saturday_start" time without time zone default '09:00:00'::time without time zone not null,"saturday_end" time without time zone default '12:00:00'::time without time zone not null,"min_room_coverage" integer default 2 not null,"room_location" text default 'Sala de Matrícula · UniMetrocamp Wyden'::text not null,"conversion_location" text default 'UniMetrocamp Wyden · Conversão'::text not null,"external_location" text default 'Atividade externa'::text not null,"room_early_breaks" jsonb default '[{"end": "13:00", "start": "12:00", "position": 1}, {"end": "14:00", "start": "13:00", "position": 2}]'::jsonb not null,"room_late_breaks" jsonb default '[{"end": "15:00", "start": "14:00", "position": 1}, {"end": "16:00", "start": "15:00", "position": 2}]'::jsonb not null,"updated_by" uuid,"updated_at" timestamp with time zone default now() not null,"schedule_start_date" date default '2026-10-26'::date not null);
create table "public"."attendance_members" ("user_id" uuid not null,"enabled" boolean default true not null,"created_by" uuid,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null);
create table "public"."calendar_events" ("id" uuid default gen_random_uuid() not null,"source_type" text not null,"source_id" uuid not null,"recipient_user_id" uuid not null,"event_uid" text default ((gen_random_uuid())::text || '@uniconecta'::text) not null,"sequence" integer default 0 not null,"status" text default 'active'::text not null,"title" text not null,"start_at" timestamp with time zone not null,"end_at" timestamp with time zone not null,"timezone" text default 'America/Sao_Paulo'::text not null,"location" text,"description" text,"crm_path" text,"created_by" uuid,"updated_by" uuid,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null);
create table "public"."calendar_invite_jobs" ("id" uuid default gen_random_uuid() not null,"calendar_event_id" uuid,"operation" text not null,"event_sequence" integer not null,"idempotency_key" text not null,"status" text default 'pending'::text not null,"attempts" integer default 0 not null,"provider" text,"provider_message_id" text,"last_error" text,"next_attempt_at" timestamp with time zone,"sent_at" timestamp with time zone,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null,"meeting_activity_id" uuid,"payload" jsonb);
create table "public"."companies" ("id" uuid default gen_random_uuid() not null,"razao_social" text default ''::text not null,"nome_fantasia" text default ''::text,"cnpj" text,"segmento" text,"colaboradores" integer,"cidade" text,"bairro" text,"telefone" text,"site" text,"origem" text,"classificacao" text default 'Mapeada'::text,"etapa" text default 'Mapeada'::text,"potencial" text default 'Médio'::text,"possui_beneficio" text,"observacoes" text,"consultor" text,"owner_id" uuid,"ultimo_contato" date,"proxima_acao" text,"data_proxima_acao" date,"data_entrada" date default CURRENT_DATE,"link_inscricao" text,"link_consultor" text,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null,"logradouro" text,"numero" text,"complemento" text,"cep" text,"latitude" double precision,"longitude" double precision,"geocoded_at" timestamp with time zone,"geocode_precision" text,"geocode_hash" text,"next_action_start_time" time without time zone,"next_action_end_time" time without time zone,"next_action_location" text,"next_action_owner_id" uuid,"relationship_status" text default 'inactive'::text not null,"relationship_changed_at" timestamp with time zone default now() not null);
create table "public"."activity_participants" ("id" uuid default gen_random_uuid() not null,"activity_id" uuid not null,"name" text default ''::text not null,"email" text not null,"participant_type" text default 'optional'::text not null);
create table "public"."microsoft_calendar_accounts" ("user_id" uuid not null,"microsoft_user_id" text not null,"tenant_id" text not null,"email" text not null,"access_token_encrypted" text not null,"refresh_token_encrypted" text not null,"expires_at" timestamp with time zone not null,"updated_at" timestamp with time zone default now() not null);
create table "public"."schools" ("id" uuid default gen_random_uuid() not null,"name" text not null,"inep_code" text,"cnpj" text,"network_type" text default 'Outra'::text not null,"cidade" text,"bairro" text,"logradouro" text,"numero" text,"complemento" text,"cep" text,"latitude" double precision,"longitude" double precision,"geocoded_at" timestamp with time zone,"geocode_precision" text,"phone" text,"email" text,"website" text,"instagram" text,"relationship_stage" text default 'Mapeada'::text not null,"relationship_status" text,"potential" text,"classification" text,"primary_owner_id" uuid,"last_action_at" date,"next_action" text,"next_action_at" date,"notes" text,"created_by" uuid,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null,"geocode_hash" text,"offered_grades" text[]);
create table "public"."activities" ("id" uuid default gen_random_uuid() not null,"company_id" uuid not null,"consultor" text,"data" date default CURRENT_DATE not null,"tipo" text,"contato" text,"resultado" text,"observacao" text,"leads" integer,"impactados" integer,"etapa_anterior" text,"etapa_nova" text,"proxima_acao" text,"data_proximo_contato" date,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null,"status" text default 'realizada'::text not null,"primary_owner_id" uuid,"conta_meta_semanal" boolean default true not null,"contact_id" uuid,"organizer_user_id" uuid,"organizer_name" text,"organizer_email" text,"contact_email" text,"meeting_type" text,"title" text,"description" text,"start_at" timestamp with time zone,"end_at" timestamp with time zone,"location" text,"outlook_event_id" text,"outlook_web_url" text,"outlook_change_key" text,"teams_meeting_url" text,"revision" integer default 0 not null,"sync_status" text,"sync_error" text,"sync_operation" text,"sync_payload" jsonb,"sync_lock" uuid,"sync_locked_at" timestamp with time zone,"meeting_rsvp" jsonb default '[]'::jsonb not null,"calendar_provider" text default 'graph'::text not null,"calendar_uid" text default ((gen_random_uuid())::text || '@uniconecta'::text) not null,"calendar_organizer_email" text,"meeting_url" text,"email_queued_revision" integer default 0 not null);
create table "public"."company_actions" ("id" uuid default gen_random_uuid() not null,"company_id" uuid not null,"action_type" text not null,"title" text not null,"occurred_at" timestamp with time zone not null,"responsible_user_id" uuid,"responsible_name" text not null,"description" text not null,"result" text,"notes" text,"location" text,"channel" text,"promotion_url" text,"created_by" uuid default auth.uid(),"creator_name" text not null,"created_at" timestamp with time zone default now() not null);
create table "public"."supervest_cycles" ("id" uuid default gen_random_uuid() not null,"name" text not null,"edition" text,"academic_cycle" text,"campaign_start_at" date,"campaign_end_at" date,"event_at" timestamp with time zone,"registrations_target" integer default 0 not null,"high_school_actions_target" integer default 0 not null,"status" text default 'planejamento'::text not null,"notes" text,"created_by" uuid,"updated_by" uuid,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null,"capture_academic_year" integer,"is_active" boolean default false not null);
create table "public"."school_actions" ("id" uuid default gen_random_uuid() not null,"school_id" uuid not null,"action_date" date not null,"start_time" time without time zone,"end_time" time without time zone,"action_type" text default 'Outra'::text not null,"objective" text,"supervest_cycle_id" uuid,"commercial_cycle_id" uuid,"status" text default 'agendada'::text not null,"estimated_students" integer,"estimated_classes" integer,"notes" text,"result_notes" text,"primary_owner_id" uuid,"created_by" uuid,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null,"location" text,"school_contact_id" uuid,"target_grades" text[],"class_details" text,"capture_publicity" boolean default false not null,"results_recorded_at" timestamp with time zone,"results_recorded_by" uuid,"primary_owner_name" text);
create table "public"."school_action_participants" ("school_action_id" uuid not null,"user_id" uuid not null,"role_in_action" text,"user_name" text);
create table "public"."school_action_grade_results" ("id" uuid default gen_random_uuid() not null,"school_action_id" uuid not null,"grade" text not null,"classes_count" integer,"estimated_impacted" integer,"leads" integer default 0 not null,"supervest_registrations" integer default 0 not null,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null,"pending_registrations" integer default 0 not null);
create table "public"."school_campaigns" ("school_id" uuid not null,"supervest_cycle_id" uuid not null,"created_by" uuid,"created_at" timestamp with time zone default now() not null);
create table "public"."school_campaign_contacts" ("id" uuid default gen_random_uuid() not null,"school_id" uuid not null,"supervest_cycle_id" uuid not null,"institutional_contact_id" uuid,"consultant_id" uuid,"consultant_name" text default ''::text not null,"occurred_at" timestamp with time zone not null,"person_name" text not null,"person_role" text,"channel" text not null,"description" text not null,"response" text,"negotiation_status" text not null,"next_step" text,"return_at" timestamp with time zone,"created_by" uuid,"created_at" timestamp with time zone default now() not null);
create table "public"."school_campaign_engagements" ("id" uuid default gen_random_uuid() not null,"school_id" uuid not null,"supervest_cycle_id" uuid not null,"user_id" uuid,"user_name" text default ''::text not null,"status" text default 'em_contato'::text not null,"started_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null,"ended_at" timestamp with time zone,"closed_by" uuid,"created_by" uuid);
create table "public"."school_campaign_history" ("id" uuid default gen_random_uuid() not null,"school_id" uuid not null,"supervest_cycle_id" uuid,"entity" text not null,"operation" text not null,"record_id" uuid,"before_data" jsonb,"after_data" jsonb,"actor_id" uuid,"actor_name" text not null,"recorded_at" timestamp with time zone default now() not null);
create table "public"."company_portfolio_history" ("id" uuid default gen_random_uuid() not null,"company_id" uuid not null,"kind" text not null,"previous_value" jsonb default '{}'::jsonb not null,"new_value" jsonb default '{}'::jsonb not null,"reason" text not null,"notes" text,"changed_by" uuid,"changed_by_name" text not null,"created_at" timestamp with time zone default now() not null);
create table "public"."company_assignment_requests" ("id" uuid default gen_random_uuid() not null,"company_id" uuid not null,"requested_by" uuid not null,"requested_by_name" text not null,"previous_owner_id" uuid,"previous_owner_name" text,"relationship_version" timestamp with time zone not null,"reason" text not null,"notes" text,"status" text default 'pending'::text not null,"reviewed_by" uuid,"reviewed_by_name" text,"review_notes" text,"reviewed_at" timestamp with time zone,"created_at" timestamp with time zone default now() not null);
create table "public"."company_portfolio_notifications" ("id" uuid default gen_random_uuid() not null,"user_id" uuid not null,"company_id" uuid,"kind" text not null,"message" text not null,"dedupe_key" text not null,"read_at" timestamp with time zone,"created_at" timestamp with time zone default now() not null);
create table "public"."user_access_history" ("id" uuid default gen_random_uuid() not null,"actor_id" uuid not null,"target_id" uuid not null,"action" text not null,"status" text not null,"created_at" timestamp with time zone default now() not null,"completed_at" timestamp with time zone);
CREATE OR REPLACE FUNCTION private.sync_school_action_calendar(p_action_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end; $function$
;
CREATE OR REPLACE FUNCTION public.log_school_owner_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.primary_owner_id is not null then
      insert into public.school_owner_history(school_id, previous_owner_id, new_owner_id, changed_by)
      values (new.id, null, new.primary_owner_id, auth.uid());
    end if;
  elsif new.primary_owner_id is distinct from old.primary_owner_id then
    insert into public.school_owner_history(school_id, previous_owner_id, new_owner_id, changed_by)
    values (new.id, old.primary_owner_id, new.primary_owner_id, auth.uid());
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin new.updated_at := now(); return new; end;
$function$
;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role text;
  v_name text;
  v_tag  text;
begin
  v_role := lower(coalesce(nullif(meta->>'role', ''), 'consultor_b2b'));
  if v_role = 'consultor' then
    v_role := 'consultor_b2b';
  end if;
  if v_role not in ('supervisor', 'consultor_b2b', 'high_school') then
    v_role := 'consultor_b2b';
  end if;

  v_name := coalesce(nullif(meta->>'full_name', ''), split_part(new.email, '@', 1));

  v_tag := nullif(meta->>'consultant_tag', '');
  if v_tag is null then
    v_tag := trim(both '-' from lower(regexp_replace(
      translate(v_name,
        'àáâãäçèéêëìíîïñòóôõöùúûüýÀÁÂÃÄÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ',
        'aaaaaceeeeiiiinooooouuuuyAAAAACEEEEIIIINOOOOOUUUUY'),
      '[^a-zA-Z0-9]+', '-', 'g')));
  end if;

  insert into public.profiles (id, full_name, email, role, consultant_tag, active)
  values (new.id, v_name, new.email, v_role, v_tag, true)
  on conflict (id) do nothing;

  return new;
exception when others then
  raise warning '[handle_new_user] falhou para % (%): %', new.id, new.email, sqlerrm;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.is_high_school_writer()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active
      and p.role in ('gerente','supervisor','high_school')
  );
$function$
;
CREATE OR REPLACE FUNCTION public.b2b_keep_meeting_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if old.meeting_type is not null then
    raise exception 'Cancele a reunião e mantenha seu histórico. Empresas com reuniões não podem ser excluídas.';
  end if;
  return old;
end $function$
;
CREATE OR REPLACE FUNCTION public.guard_profile_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor uuid := auth.uid();
  actor_role text;
begin
  if actor is null then
    return new; -- service role / definer trigger context
  end if;

  select role into actor_role from public.profiles where id = actor;

  -- non-managers cannot change role or active on any profile (incl. their own)
  if coalesce(actor_role, '') not in ('gerente', 'supervisor') then
    if new.role is distinct from old.role or new.active is distinct from old.active then
      raise exception 'Sem permissão para alterar papel ou status do perfil.';
    end if;
  end if;

  -- only a gerente can promote someone to gerente
  if new.role = 'gerente'
     and old.role is distinct from 'gerente'
     and coalesce(actor_role, '') <> 'gerente' then
    raise exception 'Somente a gerência pode promover um usuário a gerente.';
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.school_capture_action_editor(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$select private.school_capture_allowed() and exists(select 1 from public.school_actions a where a.id=p_id and a.supervest_cycle_id is not null and
  (private.school_capture_manager() or public.is_high_school_writer() or a.created_by=(select auth.uid()) or a.primary_owner_id=(select auth.uid()) or
    exists(select 1 from public.school_action_participants p where p.school_action_id=a.id and p.user_id=(select auth.uid()))))$function$
;
CREATE OR REPLACE FUNCTION public.enforce_supervest_eligibility()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare eligible boolean;
begin
  select supervest_eligible into eligible from public.grade_levels where code = new.grade;
  if coalesce(eligible, false) = false then
    new.supervest_registrations := 0;
  end if;
  if new.leads < 0 then new.leads := 0; end if;
  if new.supervest_registrations < 0 then new.supervest_registrations := 0; end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.stamp_school_capture_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$declare actor uuid:=auth.uid(); name text; begin
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
end$function$
;
CREATE OR REPLACE FUNCTION public.log_school_stage_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    insert into public.school_stage_history(school_id, previous_stage, new_stage, changed_by)
    values (new.id, null, new.relationship_stage, auth.uid());
  elsif new.relationship_stage is distinct from old.relationship_stage then
    insert into public.school_stage_history(school_id, previous_stage, new_stage, changed_by)
    values (new.id, old.relationship_stage, new.relationship_stage, auth.uid());
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.is_manager()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active
      and p.role in ('gerente','supervisor')
  );
$function$
;
CREATE OR REPLACE FUNCTION public.update_goal(p_id uuid, p_target numeric, p_status text, p_start date, p_end date, p_notes text, p_reason text)
 RETURNS goals
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare row public.goals;
begin
  perform set_config('app.change_reason', coalesce(p_reason, ''), true);
  update public.goals
     set target_value = coalesce(p_target, target_value),
         status       = coalesce(p_status, status),
         start_at     = coalesce(p_start, start_at),
         end_at       = coalesce(p_end, end_at),
         notes        = p_notes,
         updated_by   = auth.uid()
   where id = p_id
  returning * into row;
  return row;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.log_goal_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare motivo text;
begin
  motivo := nullif(current_setting('app.change_reason', true), '');
  if tg_op = 'INSERT' then
    insert into public.goal_history(goal_id, field_changed, previous_value, new_value, changed_by, reason)
    values (new.id, 'created', null, new.target_value::text, auth.uid(), motivo);
    return new;
  end if;
  if new.target_value is distinct from old.target_value then
    insert into public.goal_history(goal_id, field_changed, previous_value, new_value, changed_by, reason)
    values (new.id, 'target_value', old.target_value::text, new.target_value::text, auth.uid(), motivo);
  end if;
  if new.status is distinct from old.status then
    insert into public.goal_history(goal_id, field_changed, previous_value, new_value, changed_by, reason)
    values (new.id, 'status', old.status, new.status, auth.uid(), motivo);
  end if;
  if new.start_at is distinct from old.start_at then
    insert into public.goal_history(goal_id, field_changed, previous_value, new_value, changed_by, reason)
    values (new.id, 'start_at', old.start_at::text, new.start_at::text, auth.uid(), motivo);
  end if;
  if new.end_at is distinct from old.end_at then
    insert into public.goal_history(goal_id, field_changed, previous_value, new_value, changed_by, reason)
    values (new.id, 'end_at', old.end_at::text, new.end_at::text, auth.uid(), motivo);
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.touch_route_plan_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  return new;
end
$function$
;
CREATE OR REPLACE FUNCTION private.sync_school_action_agenda_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end; $function$
;
CREATE OR REPLACE FUNCTION private.b2b_audit(p_company uuid, p_kind text, p_old jsonb, p_new jsonb, p_reason text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
 insert into public.company_portfolio_history(company_id,kind,previous_value,new_value,reason,notes,changed_by,changed_by_name)
 values(p_company,p_kind,p_old,p_new,p_reason,p_notes,auth.uid(),coalesce(private.b2b_name(auth.uid()),'Rotina automática')) returning id into v_id;
 return v_id;
end $function$
;
CREATE OR REPLACE FUNCTION public.b2b_portfolio_command(p_command text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.b2b_portfolio_command(p_command,p_payload)$function$
;
CREATE OR REPLACE FUNCTION public.attendance_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.queue_calendar_invite_job(p_event_id uuid, p_operation text, p_sequence integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_operation not in ('REQUEST','CANCEL') then
    raise exception 'Operação de calendário inválida';
  end if;

  insert into public.calendar_invite_jobs (
    calendar_event_id,
    operation,
    event_sequence,
    idempotency_key,
    status,
    attempts,
    last_error,
    next_attempt_at
  ) values (
    p_event_id,
    p_operation,
    greatest(coalesce(p_sequence, 0), 0),
    p_event_id::text || ':' || p_operation || ':' || greatest(coalesce(p_sequence, 0), 0)::text,
    'pending',
    0,
    null,
    null
  )
  on conflict (idempotency_key) do nothing;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.attendance_log_occurrence_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  actor uuid := auth.uid();
  action_name text;
begin
  if tg_op = 'INSERT' then
    action_name := 'insert';
    insert into public.attendance_occurrence_history(occurrence_id, action, changed_by, new_values)
    values (new.id, action_name, coalesce(new.updated_by, new.created_by, actor), to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    action_name := case
      when old.user_id is distinct from new.user_id then 'reassign'
      when old.status <> 'published' and new.status = 'published' then 'publish'
      when old.status <> 'cancelled' and new.status = 'cancelled' then 'cancel'
      else 'update'
    end;
    insert into public.attendance_occurrence_history(occurrence_id, action, changed_by, old_values, new_values)
    values (new.id, action_name, coalesce(new.updated_by, actor), to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into public.attendance_occurrence_history(occurrence_id, action, changed_by, old_values)
    values (old.id, 'delete', actor, to_jsonb(old));
    return old;
  end if;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.b2b_ensure_cycles()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d date;cycle jsonb;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and active) then raise exception 'Não autenticado.'; end if;
 perform pg_advisory_xact_lock(827164);
 for d in select x::date from generate_series(date_trunc('year',now())-interval '1 year',date_trunc('year',now())+interval '3 years',interval '1 month') x loop
   cycle:=public.b2b_commercial_cycle(d);
   if not exists(select 1 from public.commercial_cycles where start_at=(cycle->>'start')::date and end_at=(cycle->>'end')::date) then
     insert into public.commercial_cycles(name,start_at,end_at,status) values(cycle->>'name',(cycle->>'start')::date,(cycle->>'end')::date,'ativo');
   end if;
 end loop;
end $function$
;
CREATE OR REPLACE FUNCTION public.b2b_ensure_cycles()
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.b2b_ensure_cycles() $function$
;
CREATE OR REPLACE FUNCTION private.b2b_guard_departure()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if old.active and (not new.active or (new.role not in('gerente','supervisor','consultor_b2b','consultor'))) then
   if exists(select 1 from public.companies where owner_id=old.id) then
     raise exception 'Redistribua a carteira B2B antes de desativar ou alterar o perfil do consultor.';
   end if;
 end if;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.sync_calendar_event_db(p_source_type text, p_source_id uuid, p_recipient_user_id uuid, p_title text, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_timezone text DEFAULT 'America/Sao_Paulo'::text, p_location text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_crm_path text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid, p_cancel boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r record;
  current_event record;
  new_sequence integer;
  event_id uuid;
begin
  if p_source_type not in ('attendance','school_action','company_activity') then
    raise exception 'Origem de calendário inválida';
  end if;

  -- Sem destinatário ou cancelamento explícito: cancela todos os eventos ativos da fonte.
  if p_recipient_user_id is null or p_cancel then
    for r in
      select *
      from public.calendar_events
      where source_type = p_source_type
        and source_id = p_source_id
        and status <> 'cancelled'
      for update
    loop
      new_sequence := coalesce(r.sequence, 0) + 1;
      update public.calendar_events
      set status = 'cancelled',
          sequence = new_sequence,
          updated_by = p_actor_id,
          updated_at = now()
      where id = r.id;
      perform public.queue_calendar_invite_job(r.id, 'CANCEL', new_sequence);
      event_id := r.id;
    end loop;
    return event_id;
  end if;

  if p_start_at is null or p_end_at is null or p_end_at <= p_start_at then
    raise exception 'Horário de calendário inválido';
  end if;

  -- Troca de responsável: cancela o destinatário anterior mantendo o histórico/UID.
  for r in
    select *
    from public.calendar_events
    where source_type = p_source_type
      and source_id = p_source_id
      and recipient_user_id <> p_recipient_user_id
      and status <> 'cancelled'
    for update
  loop
    new_sequence := coalesce(r.sequence, 0) + 1;
    update public.calendar_events
    set status = 'cancelled',
        sequence = new_sequence,
        updated_by = p_actor_id,
        updated_at = now()
    where id = r.id;
    perform public.queue_calendar_invite_job(r.id, 'CANCEL', new_sequence);
  end loop;

  select * into current_event
  from public.calendar_events
  where source_type = p_source_type
    and source_id = p_source_id
    and recipient_user_id = p_recipient_user_id
  for update;

  if found then
    -- Evita e-mail duplicado quando nada mudou.
    if current_event.status = 'active'
       and current_event.title = p_title
       and current_event.start_at = p_start_at
       and current_event.end_at = p_end_at
       and current_event.timezone = coalesce(nullif(trim(p_timezone),''), 'America/Sao_Paulo')
       and coalesce(current_event.location,'') = coalesce(nullif(trim(p_location),''),'')
       and coalesce(current_event.description,'') = coalesce(nullif(trim(p_description),''),'')
       and coalesce(current_event.crm_path,'') = coalesce(nullif(trim(p_crm_path),''),'') then
      return current_event.id;
    end if;

    new_sequence := coalesce(current_event.sequence, 0) + 1;
    update public.calendar_events
    set title = p_title,
        start_at = p_start_at,
        end_at = p_end_at,
        timezone = coalesce(nullif(trim(p_timezone),''), 'America/Sao_Paulo'),
        location = nullif(trim(p_location),''),
        description = nullif(trim(p_description),''),
        crm_path = nullif(trim(p_crm_path),''),
        status = 'active',
        sequence = new_sequence,
        updated_by = p_actor_id,
        updated_at = now()
    where id = current_event.id;
    perform public.queue_calendar_invite_job(current_event.id, 'REQUEST', new_sequence);
    return current_event.id;
  end if;

  insert into public.calendar_events (
    source_type, source_id, recipient_user_id, title, start_at, end_at,
    timezone, location, description, crm_path, created_by, updated_by
  ) values (
    p_source_type, p_source_id, p_recipient_user_id, p_title, p_start_at, p_end_at,
    coalesce(nullif(trim(p_timezone),''), 'America/Sao_Paulo'),
    nullif(trim(p_location),''), nullif(trim(p_description),''), nullif(trim(p_crm_path),''),
    p_actor_id, p_actor_id
  ) returning id, sequence into event_id, new_sequence;

  perform public.queue_calendar_invite_job(event_id, 'REQUEST', new_sequence);
  return event_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_school_action_calendar_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  school_row record;
  actor_id uuid;
  title_text text;
  location_text text;
  description_text text;
  start_ts timestamptz;
  end_ts timestamptz;
  today_sp date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if tg_op = 'DELETE' then
    perform public.sync_calendar_event_db(
      'school_action', old.id, old.primary_owner_id,
      'UniConecta · Ação de escola', now(), now() + interval '1 minute',
      'America/Sao_Paulo', null, null, null, auth.uid(), true
    );
    return old;
  end if;

  -- Marcar como realizada não deve apagar/cancelar um evento que já ocorreu.
  if new.status = 'realizada' then
    return new;
  end if;

  actor_id := coalesce(auth.uid(), new.created_by);

  if new.status = 'cancelada'
     or new.primary_owner_id is null
     or new.start_time is null
     or new.end_time is null
     or new.action_date < today_sp then
    perform public.sync_calendar_event_db(
      'school_action', new.id, new.primary_owner_id,
      'UniConecta · Ação de escola', now(), now() + interval '1 minute',
      'America/Sao_Paulo', null, null, null, actor_id, true
    );
    return new;
  end if;

  select name, cidade, logradouro, numero into school_row
  from public.schools where id = new.school_id;

  title_text := 'UniConecta · ' || coalesce(nullif(trim(new.action_type),''), 'Ação de escola') || ' · ' || coalesce(nullif(trim(school_row.name),''), 'Escola');
  location_text := nullif(trim(concat_ws(', ', nullif(trim(school_row.logradouro),''), nullif(trim(school_row.numero),''), nullif(trim(school_row.cidade),''))), '');
  if location_text is null then location_text := school_row.name; end if;
  description_text := nullif(trim(concat_ws(E'\n', nullif(trim(new.objective),''), nullif(trim(new.notes),''))), '');
  start_ts := (new.action_date + new.start_time) at time zone 'America/Sao_Paulo';
  end_ts := (new.action_date + new.end_time) at time zone 'America/Sao_Paulo';

  perform public.sync_calendar_event_db(
    'school_action', new.id, new.primary_owner_id,
    title_text, start_ts, end_ts, 'America/Sao_Paulo',
    location_text, description_text, '/high-school/escolas/' || new.school_id::text,
    actor_id, false
  );
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_company_next_action_calendar_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := auth.uid();
  title_text text;
  description_text text;
  start_ts timestamptz;
  end_ts timestamptz;
  today_sp date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if tg_op = 'DELETE' then
    perform public.sync_calendar_event_db(
      'company_activity', old.id, old.next_action_owner_id,
      'UniConecta · Próximo passo B2B', now(), now() + interval '1 minute',
      'America/Sao_Paulo', null, null, null, actor_id, true
    );
    return old;
  end if;

  if nullif(trim(new.proxima_acao),'') is null
     or new.data_proxima_acao is null
     or new.next_action_owner_id is null
     or new.next_action_start_time is null
     or new.next_action_end_time is null
     or new.data_proxima_acao < today_sp then
    perform public.sync_calendar_event_db(
      'company_activity', new.id, new.next_action_owner_id,
      'UniConecta · Próximo passo B2B', now(), now() + interval '1 minute',
      'America/Sao_Paulo', null, null, null, actor_id, true
    );
    return new;
  end if;

  title_text := 'UniConecta · ' || trim(new.proxima_acao) || ' · ' || coalesce(nullif(trim(new.nome_fantasia),''), new.razao_social);
  description_text := nullif(trim(concat_ws(E'\n', 'Empresa: ' || coalesce(nullif(trim(new.nome_fantasia),''), new.razao_social), nullif(trim(new.observacoes),''))), '');
  start_ts := (new.data_proxima_acao + new.next_action_start_time) at time zone 'America/Sao_Paulo';
  end_ts := (new.data_proxima_acao + new.next_action_end_time) at time zone 'America/Sao_Paulo';

  perform public.sync_calendar_event_db(
    'company_activity', new.id, new.next_action_owner_id,
    title_text, start_ts, end_ts, 'America/Sao_Paulo',
    new.next_action_location, description_text, '/?view=agenda', actor_id, false
  );
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.b2b_guard_settings()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if (new.b2b_risk_days is distinct from old.b2b_risk_days or new.b2b_critical_days is distinct from old.b2b_critical_days)
   and not private.b2b_manager() then raise exception 'Somente o Gerente Comercial pode configurar alertas B2B.'; end if;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION private.b2b_guard_cycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare cycle jsonb;
begin
 cycle:=public.b2b_commercial_cycle(new.start_at);
 if new.start_at is distinct from (cycle->>'start')::date or new.end_at is distinct from (cycle->>'end')::date then
   raise exception 'Use o período automático do ciclo comercial (outubro–abril ou maio–setembro).';
 end if;
 new.name:=cycle->>'name';return new;
end $function$
;
CREATE OR REPLACE FUNCTION private.b2b_guard_profile_privileges()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if current_user='authenticated' then
   if tg_op='INSERT' then
     if not private.b2b_manager() and (new.role not in('consultor_b2b','consultor','high_school') or not new.active) then
       raise exception 'Perfil de acesso deve ser atribuído pela gerência.';
     end if;
   elsif (new.role is distinct from old.role or new.active is distinct from old.active) and not private.b2b_manager() then
     raise exception 'Perfil de acesso deve ser alterado pela gerência.';
   end if;
 end if;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.b2b_save_contact(p_company uuid, p_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION public.b2b_finish_meeting(p_id uuid, p_lock uuid, p_event jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION public.b2b_stage_meeting(p_id uuid, p_actor uuid, p_revision integer, p_operation text, p_payload jsonb)
 RETURNS activities
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION public.b2b_queue_email_meeting(p_id uuid, p_sender text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION public.b2b_settle_email_meeting(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION public.configure_school_capture_cycle(p_cycle_id uuid, p_year integer, p_start date, p_end date, p_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$begin
  if not public.is_high_school_writer() then raise exception 'Você não tem permissão para configurar edições.'; end if;
  if p_year not between 1900 and 2200 or p_year is null then raise exception 'Informe o ano letivo da divulgação.'; end if;
  if p_start is not null and p_end is not null and p_end<p_start then raise exception 'O período de captação é inválido.'; end if;
  if not exists(select 1 from public.supervest_cycles where id=p_cycle_id) then raise exception 'Edição não encontrada.'; end if;
  if p_active then update public.supervest_cycles set is_active=false where is_active; end if;
  update public.supervest_cycles set capture_academic_year=p_year,campaign_start_at=p_start,campaign_end_at=p_end,is_active=p_active,updated_by=auth.uid() where id=p_cycle_id;
end$function$
;
CREATE OR REPLACE FUNCTION private.check_password_rotation()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is not null and coalesce(auth.role(),'')<>'service_role'
     and exists(select 1 from public.profiles p where p.id=auth.uid() and (p.must_change_password or p.password_reset_pending)) then
    if trim(both '/' from coalesce(current_setting('request.path',true),''))='profiles'
       and current_setting('request.method',true) in ('GET','HEAD') then return; end if;
    raise insufficient_privilege using message='Altere sua senha temporária antes de acessar o CRM.';
  end if;
end $function$
;
CREATE OR REPLACE FUNCTION public.stamp_company_action()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor_tag text; actor_name text; responsible_tag text; responsible_full_name text;
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  select full_name, consultant_tag into actor_name, actor_tag
    from public.profiles where id = auth.uid() and active;
  select full_name, consultant_tag into responsible_full_name, responsible_tag
    from public.profiles where id = new.responsible_user_id and active
      and role in ('gerente','supervisor','consultor_b2b','consultor');
  if actor_name is null or responsible_full_name is null then
    raise exception 'Selecione um consultor B2B ativo.';
  end if;
  new.created_by := auth.uid();
  new.created_at := now();
  new.creator_name := case
    when nullif(btrim(actor_tag),'') is null then actor_name
    when actor_tag ~ '^[a-z0-9_-]+$' then initcap(regexp_replace(actor_tag,'[-_]+',' ','g'))
    else btrim(actor_tag) end;
  new.responsible_name := case
    when nullif(btrim(responsible_tag),'') is null then responsible_full_name
    when responsible_tag ~ '^[a-z0-9_-]+$' then initcap(regexp_replace(responsible_tag,'[-_]+',' ','g'))
    else btrim(responsible_tag) end;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.school_capture_allowed()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$select exists(select 1 from public.profiles where id=(select auth.uid()) and active and role in ('gerente','supervisor','high_school','consultor_b2b','consultor'))$function$
;
CREATE OR REPLACE FUNCTION private.school_capture_manager()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$select exists(select 1 from public.profiles where id=(select auth.uid()) and active and role in ('gerente','supervisor'))$function$
;
CREATE OR REPLACE FUNCTION private.school_capture_user_name(p_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$select coalesce(nullif(initcap(replace(consultant_tag,'-',' ')),''),full_name) from public.profiles where id=p_id and active and role in ('gerente','supervisor','high_school','consultor_b2b','consultor')$function$
;
CREATE OR REPLACE FUNCTION private.guard_school_capture_action()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$begin
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
end$function$
;
CREATE OR REPLACE FUNCTION private.stamp_school_capture_participant()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$begin
  if auth.uid() is null then return new; end if;
  if not public.is_high_school_writer() and not private.school_capture_action_editor(new.school_action_id) then raise exception 'Participação não autorizada.'; end if;
  if tg_op='UPDATE' and (new.school_action_id,new.user_id) is distinct from (old.school_action_id,old.user_id) then raise exception 'Crie uma nova participação para outro usuário ou ação.'; end if;
  new.user_name:=coalesce(private.school_capture_user_name(new.user_id),case when tg_op='UPDATE' then old.user_name end);
  if new.user_name is null then raise exception 'Participante inválido ou inativo.'; end if;
  return new;
end$function$
;
CREATE OR REPLACE FUNCTION private.guard_school_capture_result()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$declare linked boolean; action_status text; begin
  if auth.uid() is null then return coalesce(new,old); end if;
  select supervest_cycle_id is not null,status into linked,action_status from public.school_actions where id=case when tg_op='INSERT' then new.school_action_id else old.school_action_id end;
  if not coalesce(linked,false) then return coalesce(new,old); end if;
  if tg_op='DELETE' then raise exception 'Preserve o resultado: corrija as quantidades em vez de excluí-lo.'; end if;
  if tg_op='UPDATE' and (new.school_action_id,new.grade) is distinct from (old.school_action_id,old.grade) then raise exception 'O resultado não pode ser transferido para outra ação ou série.'; end if;
  if action_status<>'realizada' then raise exception 'Registre a realização da ação antes do resultado.'; end if;
  if coalesce(new.leads,-1)<0 or coalesce(new.pending_registrations,-1)<0 or coalesce(new.supervest_registrations,-1)<0 or coalesce(new.estimated_impacted,0)<0 or coalesce(new.classes_count,0)<0 then raise exception 'Resultados devem ser quantidades não negativas.'; end if;
  return new;
end$function$
;
CREATE OR REPLACE FUNCTION private.audit_school_capture()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare row_data jsonb; previous_data jsonb; school uuid; cycle uuid; record uuid; actor uuid:=auth.uid(); actor_label text; begin
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
end$function$
;
CREATE OR REPLACE FUNCTION public.save_school_capture(p_school_id uuid, p_cycle_id uuid, p_command text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$declare actor uuid:=auth.uid(); uid uuid; rec uuid; person uuid; action_row public.school_actions%rowtype; e public.school_campaign_engagements%rowtype; item jsonb; users uuid[]; grades text[]; name text; current_school public.schools%rowtype; stat text; occur timestamptz; begin
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
end$function$
;
CREATE OR REPLACE FUNCTION public.b2b_commercial_cycle(p_date date)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO ''
AS $function$
  with c as (
    select extract(year from p_date)::int + case when extract(month from p_date)>=10 then 1 else 0 end y,
      case when extract(month from p_date) between 5 and 9 then 2 else 1 end n
  ) select jsonb_build_object('code',lpad((y%100)::text,2,'0')||'.'||n,
    'name',n||'º Ciclo '||y,'start',case when n=1 then make_date(y-1,10,1) else make_date(y,5,1) end,
    'end',case when n=1 then make_date(y,4,30) else make_date(y,9,30) end,
    'year',y,'number',n,'ordinal',y*2+n) from c;
$function$
;
CREATE OR REPLACE FUNCTION public.b2b_valid_activity_type(p_type text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select lower(btrim(coalesce(p_type,''))) = any(array[
 'visita','visita presencial','reunião','reunião presencial','reunião on-line','reunião online',
 'reunião de relacionamento','apresentação de proposta','feira ou evento','evento','palestra',
 'plantão comercial','divulgação','divulgação online','ação presencial','ativação','renovação de convênio']);
$function$
;
CREATE OR REPLACE FUNCTION public.b2b_last_valid_activity(p_company uuid, p_day date)
 RETURNS TABLE(id uuid, source text, action_type text, action_date date, user_id uuid, user_name text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select x.id,x.source,x.action_type,x.action_date,x.user_id,x.user_name from (
   select a.id,'activities'::text source,a.tipo action_type,a.data action_date,
     coalesce(a.primary_owner_id,a.organizer_user_id) user_id,a.consultor user_name,a.created_at
   from public.activities a where a.company_id=p_company and a.status='realizada'
     and a.data<=p_day and public.b2b_valid_activity_type(a.tipo)
   union all
   select a.id,'company_actions',case when a.action_type='presencial' then 'Ação presencial' else 'Divulgação online' end,
     (a.occurred_at at time zone 'America/Sao_Paulo')::date,a.responsible_user_id,a.responsible_name,a.created_at
   from public.company_actions a where a.company_id=p_company
     and (a.occurred_at at time zone 'America/Sao_Paulo')::date<=p_day
     and a.occurred_at<=now()
 ) x order by x.action_date desc,x.created_at desc,x.id limit 1;
$function$
;
CREATE OR REPLACE FUNCTION private.b2b_manager()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.profiles where id=auth.uid() and active and role='gerente');
$function$
;
CREATE OR REPLACE FUNCTION private.b2b_name(p_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select case when nullif(btrim(consultant_tag),'') is null then full_name
   when consultant_tag ~ '^[a-z0-9_-]+$' then initcap(regexp_replace(consultant_tag,'[-_]+',' ','g'))
   else btrim(consultant_tag) end from public.profiles where id=p_id;
$function$
;
CREATE OR REPLACE FUNCTION private.b2b_notify(p_user uuid, p_company uuid, p_kind text, p_message text, p_key text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 insert into public.company_portfolio_notifications(user_id,company_id,kind,message,dedupe_key)
 select p_user,p_company,p_kind,p_message,p_key where p_user is not null
 on conflict(user_id,dedupe_key) do nothing;
$function$
;
CREATE OR REPLACE FUNCTION private.b2b_guard_company()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare reason text; history_id uuid; manager_id uuid; old_owner uuid; company_name text;
begin
 company_name:=coalesce(nullif(new.nome_fantasia,''),new.razao_social);
 if tg_op='INSERT' then
   new.relationship_status:='inactive';new.relationship_changed_at:=now();
 end if;
 if tg_op='UPDATE' then old_owner:=old.owner_id; end if;
 if new.owner_id is distinct from old_owner then
   if tg_op='UPDATE' then
     if not private.b2b_manager() then raise exception 'Somente o Gerente Comercial pode transferir empresas.'; end if;
     reason:=nullif(current_setting('b2b.transfer_reason',true),'');
     if reason is null then raise exception 'Use Transferir empresa ou Transferir carteira e informe o motivo.'; end if;
   else
     reason:='Cadastro inicial';
     if auth.uid() is not null and not private.b2b_manager() and new.owner_id<>auth.uid() then
       raise exception 'Você só pode cadastrar uma empresa para sua própria carteira.';
     end if;
   end if;
   if new.owner_id is not null then
     perform 1 from public.profiles where id=new.owner_id and active
       and role in('gerente','supervisor','consultor_b2b','consultor') for share;
     if not found then raise exception 'Selecione um responsável B2B ativo.'; end if;
   end if;
 end if;
 new.consultor:=private.b2b_name(new.owner_id);
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION private.b2b_company_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_old uuid; v_name text; v_reason text; v_old_rel text;
begin
 v_name:=coalesce(nullif(new.nome_fantasia,''),new.razao_social);
 if tg_op='UPDATE' then v_old:=old.owner_id;v_old_rel:=old.relationship_status; end if;
 if new.owner_id is distinct from v_old then
   v_reason:=case when tg_op='INSERT' then 'Cadastro inicial' else current_setting('b2b.transfer_reason',true) end;
   v_id:=private.b2b_audit(new.id,'assignment',jsonb_build_object('owner_id',v_old,'name',private.b2b_name(v_old)),
     jsonb_build_object('owner_id',new.owner_id,'name',private.b2b_name(new.owner_id)),v_reason,
     nullif(current_setting('b2b.transfer_notes',true),''));
   perform private.b2b_notify(new.owner_id,new.id,'assigned',v_name||' foi atribuída à sua carteira.',v_id||':assigned');
   perform private.b2b_notify(v_old,new.id,'removed',v_name||' foi retirada da sua carteira.',v_id||':removed');
 end if;
 if tg_op='UPDATE' and new.relationship_status is distinct from v_old_rel then
   v_reason:=coalesce(nullif(current_setting('b2b.relationship_reason',true),''),'Revisão do relacionamento');
   v_id:=private.b2b_audit(new.id,'relationship',jsonb_build_object('status',v_old_rel),
     jsonb_build_object('status',new.relationship_status,'cycle',public.b2b_commercial_cycle((now() at time zone 'America/Sao_Paulo')::date),
       'activity',nullif(current_setting('b2b.relationship_activity',true),'')::jsonb),v_reason);
   perform private.b2b_notify(new.owner_id,new.id,'relationship',v_name||': '||v_reason,v_id||':relationship');
   if new.relationship_status='inactive' then
     perform private.b2b_notify(p.id,new.id,'relationship',v_name||': relacionamento perdido.',v_id||':relationship')
       from public.profiles p where p.active and p.role='gerente';
   end if;
 end if;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION private.b2b_stamp_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if new.meeting_type is null and auth.uid() is not null then
   new.primary_owner_id:=auth.uid();new.consultor:=private.b2b_name(auth.uid());
 end if;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION private.b2b_activity_relationship()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_company uuid;v_owner uuid;v_actor uuid;v_date date;v_type text;v_valid boolean;v_today date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 v_company:=new.company_id;
 if tg_table_name='company_actions' then
   if new.occurred_at>now() then return new; end if;
   v_actor:=new.responsible_user_id;v_date:=(new.occurred_at at time zone 'America/Sao_Paulo')::date;
   v_type:=case when new.action_type='presencial' then 'Ação presencial' else 'Divulgação online' end;v_valid:=true;
 else
   v_actor:=coalesce(new.primary_owner_id,new.organizer_user_id);v_date:=new.data;v_type:=new.tipo;
   v_valid:=new.status='realizada' and public.b2b_valid_activity_type(v_type);
   if tg_op='UPDATE' and old.status='realizada' and old.data is not distinct from new.data and old.tipo is not distinct from new.tipo then return new; end if;
 end if;
 if not v_valid or v_date>v_today or (public.b2b_commercial_cycle(v_today)->>'ordinal')::int
   - (public.b2b_commercial_cycle(v_date)->>'ordinal')::int>=2 then return new; end if;
 select owner_id into v_owner from public.companies where id=v_company for update;
 if v_owner is null or v_owner is distinct from v_actor then return new; end if;
 perform set_config('b2b.relationship_reason','Relacionamento reativado por ação comercial válida',true);
 perform set_config('b2b.relationship_activity',jsonb_build_object('id',new.id,'source',tg_table_name,'type',v_type,
   'date',v_date,'user_id',v_actor,'name',private.b2b_name(v_actor),'cycle',public.b2b_commercial_cycle(v_date))::text,true);
 update public.companies set relationship_status='active',relationship_changed_at=now()
 where id=v_company and relationship_status<>'active';
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION private.b2b_has_pending(p_company uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.profiles where id=auth.uid() and active)
   and exists(select 1 from public.company_assignment_requests where company_id=p_company and status='pending');
$function$
;
CREATE OR REPLACE FUNCTION private.b2b_review_companies(p_day date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.companies;a record;v_count int:=0;v_cycle jsonb:=public.b2b_commercial_cycle(p_day);v_manager uuid;v_kind text;v_message text;v_port record;
begin
 -- Stable lock ordering is shared by transfers and approvals.
 for c in select * from public.companies where relationship_status='active' order by id for update loop
   select * into a from public.b2b_last_valid_activity(c.id,p_day);
   if c.owner_id is null or a.id is null or (v_cycle->>'ordinal')::int-(public.b2b_commercial_cycle(a.action_date)->>'ordinal')::int>=2 then
     perform set_config('b2b.relationship_reason','Relacionamento perdido: ciclo completo sem ação válida',true);
     perform set_config('b2b.relationship_activity','',true);
     update public.companies set relationship_status='inactive',relationship_changed_at=now() where id=c.id;
     v_count:=v_count+1;
   end if;
 end loop;
 for v_port in select owner_id,min(owner_name) owner_name from public.b2b_company_portfolio where owner_id is not null
   group by owner_id having bool_and(not has_action_current_cycle) loop
   perform private.b2b_notify(p.id,null,'portfolio_idle','Carteira de '||v_port.owner_name||': nenhuma empresa com ação no ciclo '||(v_cycle->>'code')||'.',
     v_port.owner_id||':'||(v_cycle->>'code')||':portfolio_idle') from public.profiles p where p.active and p.role='gerente';
 end loop;
 -- Once per company / cycle / alert level, including manager visibility.
 for v_port in select * from public.b2b_company_portfolio where not has_action_current_cycle or owner_id is null loop
   v_kind:=case when v_port.owner_id is null then 'unowned' when v_port.at_risk and v_port.relationship_health='Crítico' then 'critical'
     when v_port.at_risk then 'risk' else 'no_action' end;
   v_message:=v_port.company_name||': '||case v_kind when 'unowned' then 'empresa sem responsável.'
     when 'critical' then 'atenção crítica, faltam '||v_port.days_to_cycle_end||' dias para o fim do ciclo.'
     when 'risk' then 'empresa em risco, faltam '||v_port.days_to_cycle_end||' dias para o fim do ciclo.'
     else 'sem ação válida no ciclo '||(v_cycle->>'code')||'.' end;
   perform private.b2b_notify(v_port.owner_id,v_port.id,v_kind,v_message,v_port.id||':'||(v_cycle->>'code')||':'||v_kind);
   perform private.b2b_notify(p.id,v_port.id,v_kind,v_message,v_port.id||':'||(v_cycle->>'code')||':'||v_kind)
     from public.profiles p where p.active and p.role='gerente';
 end loop;
 return jsonb_build_object('changed',v_count,'cycle',v_cycle);
end $function$
;
CREATE OR REPLACE FUNCTION private.b2b_review_authenticated()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and active) then raise exception 'Acesso desativado.'; end if;
 return private.b2b_review_companies((now() at time zone 'America/Sao_Paulo')::date);
end $function$
;
CREATE OR REPLACE FUNCTION public.b2b_review_portfolio()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if current_user='service_role' then return private.b2b_review_companies((now() at time zone 'America/Sao_Paulo')::date); end if;
 return private.b2b_review_authenticated();
end $function$
;
CREATE OR REPLACE FUNCTION private.b2b_portfolio_command(p_command text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor public.profiles;c public.companies;r public.company_assignment_requests;
 item jsonb;v_owner uuid;v_id uuid;v_reason text;v_notes text;v_count int:=0;v_hist uuid;v_existing text;v_cycle jsonb;v_last record;
begin
 select * into actor from public.profiles where id=auth.uid() and active;
 if actor.id is null then raise exception 'Não autenticado ou acesso desativado.'; end if;
 if actor.role not in('gerente','supervisor','consultor_b2b','consultor') then raise exception 'Sem permissão B2B.'; end if;
 if p_command in('transfer','review_request','settings') and actor.role<>'gerente' then
   raise exception 'Somente o Gerente Comercial pode gerenciar a carteira.';
 end if;
 v_notes:=nullif(btrim(p_payload->>'notes'),'');
 if length(v_notes)>5000 then raise exception 'Observação deve ter até 5000 caracteres.'; end if;
 if p_command='transfer' then
   v_reason:=p_payload->>'reason';
   if v_reason is null or v_reason not in('Desligamento','Redistribuição','Solicitação de atendimento','Empresa sem relacionamento ativo',
     'Alteração de região','Gestão comercial','Férias / afastamento','Outro') then raise exception 'Selecione o motivo da transferência.'; end if;
   if jsonb_typeof(p_payload->'assignments') is distinct from 'array' or jsonb_array_length(p_payload->'assignments')=0 then
     raise exception 'Selecione as empresas e os destinos.'; end if;
   if jsonb_array_length(p_payload->'assignments')>5000 then raise exception 'Transfira até 5000 empresas por vez.'; end if;
   if exists(select 1 from jsonb_array_elements(p_payload->'assignments') x group by x->>'companyId' having count(*)>1) then
     raise exception 'Empresa duplicada na transferência.'; end if;
   perform set_config('b2b.transfer_reason',v_reason,true);perform set_config('b2b.transfer_notes',coalesce(v_notes,''),true);
   for item in select x from jsonb_array_elements(p_payload->'assignments') x order by x->>'companyId' loop
     v_owner:=nullif(item->>'newOwnerId','')::uuid;
     if v_owner is null then raise exception 'Selecione o novo responsável.'; end if;
     select * into c from public.companies where id=(item->>'companyId')::uuid for update;
     if c.id is null then raise exception 'Empresa não encontrada.'; end if;
     if c.owner_id is distinct from nullif(item->>'expectedOwnerId','')::uuid then
       raise exception 'A carteira mudou. Atualize os dados antes de confirmar.';
     end if;
     if c.owner_id=v_owner then raise exception 'O novo responsável já atende esta empresa.'; end if;
     update public.companies set owner_id=v_owner where id=c.id;
     -- Pending requests remain reviewable but their saved ownership version
     -- becomes stale; approval can never overwrite this manager decision.
     v_count:=v_count+1;
   end loop;
   return jsonb_build_object('count',v_count);
 elsif p_command='request' then
   select * into c from public.companies where id=(p_payload->>'companyId')::uuid for update;
   if c.id is null then raise exception 'Empresa não encontrada.'; end if;
   select * into v_last from public.b2b_last_valid_activity(c.id,(now() at time zone 'America/Sao_Paulo')::date);
   v_cycle:=public.b2b_commercial_cycle((now() at time zone 'America/Sao_Paulo')::date);
   if c.owner_id is not null and c.relationship_status='active' and v_last.id is not null
     and (v_cycle->>'ordinal')::int-(public.b2b_commercial_cycle(v_last.action_date)->>'ordinal')::int<2 then
       raise exception 'Empresa em atendimento. Somente o gerente pode transferir.';
   end if;
   if c.owner_id=actor.id then raise exception 'Esta empresa já pertence à sua carteira.'; end if;
   if exists(select 1 from public.company_assignment_requests where company_id=c.id and status='pending') then
     raise exception 'Já existe uma solicitação de atendimento pendente para esta empresa.';
   end if;
   v_reason:=p_payload->>'reason';
   insert into public.company_assignment_requests(company_id,requested_by,requested_by_name,previous_owner_id,previous_owner_name,
     relationship_version,reason,notes) values(c.id,actor.id,private.b2b_name(actor.id),c.owner_id,private.b2b_name(c.owner_id),
     c.relationship_changed_at,v_reason,v_notes) returning * into r;
   v_hist:=private.b2b_audit(c.id,'request','{}',jsonb_build_object('id',r.id,'status','pending','requested_by',actor.id),v_reason,v_notes);
   perform private.b2b_notify(p.id,c.id,'request',coalesce(nullif(c.nome_fantasia,''),c.razao_social)||': nova solicitação de '||r.requested_by_name,r.id||':pending')
     from public.profiles p where p.active and p.role='gerente';
   return jsonb_build_object('id',r.id);
 elsif p_command in('review_request','cancel_request') then
   -- Lock company first, then request: same order as transfers and actions.
   select company_id into v_id from public.company_assignment_requests where id=(p_payload->>'id')::uuid;
   select * into c from public.companies where id=v_id for update;
   select * into r from public.company_assignment_requests where id=(p_payload->>'id')::uuid for update;
   if r.id is null then raise exception 'Solicitação não encontrada.'; end if;
   if r.status<>'pending' then raise exception 'Esta solicitação já foi concluída.'; end if;
   if p_command='cancel_request' then
     if r.requested_by<>actor.id then raise exception 'Você só pode cancelar sua própria solicitação.'; end if;
     v_existing:='cancelled';
   else
     v_existing:=p_payload->>'status';
     if v_existing is null or v_existing not in('approved','rejected') then raise exception 'Decisão inválida.'; end if;
   end if;
   if v_existing='approved' then
     if c.owner_id is distinct from r.previous_owner_id or c.relationship_changed_at is distinct from r.relationship_version then
       raise exception 'A carteira ou o relacionamento mudou. Recuse a solicitação e solicite uma nova análise.';
     end if;
     select * into v_last from public.b2b_last_valid_activity(c.id,(now() at time zone 'America/Sao_Paulo')::date);
     v_cycle:=public.b2b_commercial_cycle((now() at time zone 'America/Sao_Paulo')::date);
     if c.owner_id is not null and c.relationship_status='active' and v_last.id is not null
       and (v_cycle->>'ordinal')::int-(public.b2b_commercial_cycle(v_last.action_date)->>'ordinal')::int<2 then
         raise exception 'A empresa voltou a ter relacionamento ativo. Use a transferência gerencial.';
     end if;
     perform set_config('b2b.transfer_reason','Solicitação de atendimento',true);
     perform set_config('b2b.transfer_notes',coalesce(v_notes,r.notes,''),true);
     perform set_config('b2b.relationship_reason','Aguardando ação válida do novo responsável',true);
     perform set_config('b2b.relationship_activity','',true);
     update public.companies set owner_id=r.requested_by,relationship_status='inactive',
       relationship_changed_at=case when relationship_status='active' then now() else relationship_changed_at end where id=c.id;
   end if;
   update public.company_assignment_requests set status=v_existing,reviewed_by=actor.id,reviewed_by_name=private.b2b_name(actor.id),
     reviewed_at=now(),review_notes=v_notes where id=r.id;
   perform private.b2b_audit(c.id,'request',jsonb_build_object('id',r.id,'status','pending'),
     jsonb_build_object('id',r.id,'status',v_existing),case v_existing when 'approved' then 'Solicitação aprovada'
       when 'rejected' then 'Solicitação recusada' else 'Solicitação cancelada pelo consultor' end,v_notes);
   perform private.b2b_notify(r.requested_by,c.id,'request',coalesce(nullif(c.nome_fantasia,''),c.razao_social)||': solicitação '||
     case v_existing when 'approved' then 'aprovada' when 'rejected' then 'recusada' else 'cancelada' end,r.id||':'||v_existing);
   return jsonb_build_object('id',r.id,'status',v_existing);
 elsif p_command='mark_read' then
   update public.company_portfolio_notifications set read_at=now() where user_id=actor.id
     and id=(p_payload->>'id')::uuid and read_at is null;
   return '{}';
 elsif p_command='settings' then
   update public.app_settings set b2b_risk_days=(p_payload->>'riskDays')::int,b2b_critical_days=(p_payload->>'criticalDays')::int where id=1;
   return '{}';
 end if;
 raise exception 'Operação inválida.';
end $function$
;
CREATE OR REPLACE FUNCTION private.password_access_allowed()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.active and not p.must_change_password and not p.password_reset_pending);
$function$
;
CREATE OR REPLACE FUNCTION private.guard_password_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_user in ('authenticated','anon') then
    if tg_op='INSERT' then
      if new.must_change_password or new.password_reset_pending or new.password_reset_operation is not null or new.password_changed_at is not null then
        raise insufficient_privilege using message='Estado de senha protegido pelo servidor.';
      end if;
    elsif new.must_change_password is distinct from old.must_change_password
       or new.password_reset_pending is distinct from old.password_reset_pending
       or new.password_reset_operation is distinct from old.password_reset_operation
       or new.password_changed_at is distinct from old.password_changed_at then
      raise insufficient_privilege using message='Estado de senha protegido pelo servidor.';
    end if;
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION private.on_auth_password_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.encrypted_password is distinct from old.encrypted_password
     and coalesce(new.encrypted_password,'')<>''
     and exists(select 1 from public.profiles p where p.id=new.id and not p.password_reset_pending) then
    update public.profiles set must_change_password=false, password_reset_operation=null, password_changed_at=now() where id=new.id;
    insert into public.user_access_history(actor_id,target_id,action,status,completed_at)
      values(new.id,new.id,'password_changed','succeeded',now());
  end if;
  return new;
end $function$
;
alter table school_owner_history add constraint "school_owner_history_pkey" PRIMARY KEY (id);
alter table school_contacts add constraint "school_contacts_pkey" PRIMARY KEY (id);
alter table profiles add constraint "profiles_pkey" PRIMARY KEY (id);
alter table companies add constraint "companies_pkey" PRIMARY KEY (id);
alter table company_contacts add constraint "company_contacts_pkey" PRIMARY KEY (id);
alter table activities add constraint "activities_pkey" PRIMARY KEY (id);
alter table agreements add constraint "agreements_pkey" PRIMARY KEY (id);
alter table agreements add constraint "agreements_company_id_key" UNIQUE (company_id);
alter table grade_levels add constraint "grade_levels_pkey" PRIMARY KEY (code);
alter table school_grade_estimates add constraint "school_grade_estimates_pkey" PRIMARY KEY (id);
alter table app_settings add constraint "app_settings_id_check" CHECK (id = 1);
alter table app_settings add constraint "app_settings_pkey" PRIMARY KEY (id);
alter table attachments add constraint "attachments_entity_type_check" CHECK (entity_type = ANY (ARRAY['company'::text, 'activity'::text, 'school'::text, 'school_action'::text]));
alter table attachments add constraint "attachments_pkey" PRIMARY KEY (id);
alter table attachments add constraint "attachments_storage_path_key" UNIQUE (storage_path);
alter table profiles add constraint "profiles_role_check" CHECK (role = ANY (ARRAY['gerente'::text, 'supervisor'::text, 'consultor_b2b'::text, 'high_school'::text, 'consultor'::text]));
alter table schools add constraint "schools_pkey" PRIMARY KEY (id);
alter table school_stage_history add constraint "school_stage_history_pkey" PRIMARY KEY (id);
alter table school_actions add constraint "school_actions_status_check" CHECK (status = ANY (ARRAY['agendada'::text, 'confirmada'::text, 'realizada'::text, 'cancelada'::text, 'reagendada'::text]));
alter table school_actions add constraint "school_actions_pkey" PRIMARY KEY (id);
alter table school_action_participants add constraint "school_action_participants_pkey" PRIMARY KEY (school_action_id, user_id);
alter table school_action_grade_results add constraint "school_action_grade_results_pkey" PRIMARY KEY (id);
alter table commercial_cycles add constraint "commercial_cycles_status_check" CHECK (status = ANY (ARRAY['ativo'::text, 'encerrado'::text, 'planejamento'::text]));
alter table commercial_cycles add constraint "commercial_cycles_check" CHECK (end_at >= start_at);
alter table commercial_cycles add constraint "commercial_cycles_pkey" PRIMARY KEY (id);
alter table supervest_cycles add constraint "supervest_cycles_status_check" CHECK (status = ANY (ARRAY['planejamento'::text, 'captacao'::text, 'evento_proximo'::text, 'evento_realizado'::text, 'encerrado'::text, 'cancelado'::text]));
alter table supervest_cycles add constraint "supervest_cycles_pkey" PRIMARY KEY (id);
alter table supervest_snapshots add constraint "supervest_snapshots_pkey" PRIMARY KEY (id);
alter table goal_types add constraint "goal_types_pkey" PRIMARY KEY (code);
alter table goals add constraint "goals_scope_type_check" CHECK (scope_type = ANY (ARRAY['geral'::text, 'individual'::text]));
alter table goals add constraint "goals_team_type_check" CHECK (team_type = ANY (ARRAY['b2b'::text, 'high_school'::text, 'todos'::text]));
alter table goals add constraint "goals_status_check" CHECK (status = ANY (ARRAY['ativa'::text, 'encerrada'::text, 'rascunho'::text]));
alter table goals add constraint "goals_check" CHECK (end_at >= start_at);
alter table goals add constraint "goals_target_value_check" CHECK (target_value >= 0::numeric);
alter table goals add constraint "goals_check1" CHECK (scope_type <> 'individual'::text OR user_id IS NOT NULL);
alter table goals add constraint "goals_pkey" PRIMARY KEY (id);
alter table goal_history add constraint "goal_history_pkey" PRIMARY KEY (id);
alter table goal_week_exceptions add constraint "goal_week_exceptions_pkey" PRIMARY KEY (id);
alter table weekly_action_snapshots add constraint "weekly_action_snapshots_pkey" PRIMARY KEY (id);
alter table route_plans add constraint "route_plans_avg_visit_minutes_check" CHECK (avg_visit_minutes >= 0 AND avg_visit_minutes <= 600);
alter table route_plans add constraint "route_plans_status_check" CHECK (status = ANY (ARRAY['rascunho'::text, 'otimizada'::text, 'concluida'::text, 'cancelada'::text]));
alter table route_plans add constraint "route_plans_total_distance_m_check" CHECK (total_distance_m IS NULL OR total_distance_m >= 0);
alter table route_plans add constraint "route_plans_total_duration_s_check" CHECK (total_duration_s IS NULL OR total_duration_s >= 0);
alter table route_plans add constraint "route_plans_pkey" PRIMARY KEY (id);
alter table route_stops add constraint "route_stops_entity_type_check" CHECK (entity_type = ANY (ARRAY['company'::text, 'school'::text]));
alter table route_stops add constraint "route_stops_visit_minutes_check" CHECK (visit_minutes IS NULL OR visit_minutes >= 0 AND visit_minutes <= 600);
alter table route_stops add constraint "route_stops_pkey" PRIMARY KEY (id);
alter table route_user_preferences add constraint "route_user_preferences_pkey" PRIMARY KEY (user_id);
alter table route_plans add constraint "route_plans_route_name_length" CHECK (route_name IS NULL OR char_length(TRIM(BOTH FROM route_name)) >= 1 AND char_length(TRIM(BOTH FROM route_name)) <= 120);
alter table attendance_settings add constraint "attendance_settings_id_check" CHECK (id = 1);
alter table attendance_settings add constraint "attendance_settings_min_room_coverage_check" CHECK (min_room_coverage >= 1);
alter table attendance_settings add constraint "attendance_settings_pkey" PRIMARY KEY (id);
alter table attendance_team_slots add constraint "attendance_team_slots_pkey" PRIMARY KEY (slot_key);
alter table attendance_rotation_template add constraint "attendance_rotation_template_week_index_check" CHECK (week_index >= 1 AND week_index <= 4);
alter table attendance_rotation_template add constraint "attendance_rotation_template_lane_check" CHECK (lane = ANY (ARRAY['room_early'::text, 'room_late'::text, 'conversion_am_external_pm'::text, 'external_am_conversion_pm'::text, 'saturday'::text]));
alter table attendance_rotation_template add constraint "attendance_rotation_template_position_check" CHECK ("position" = ANY (ARRAY[1, 2]));
alter table attendance_rotation_template add constraint "attendance_rotation_template_pkey" PRIMARY KEY (week_index, lane, "position");
alter table attendance_cycles add constraint "attendance_cycles_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'cancelled'::text]));
alter table attendance_cycles add constraint "attendance_cycles_check" CHECK (period_end >= period_start);
alter table attendance_cycles add constraint "attendance_cycles_pkey" PRIMARY KEY (id);
alter table attendance_exceptions add constraint "attendance_exceptions_kind_check" CHECK (kind = ANY (ARRAY['closed'::text, 'holiday'::text, 'custom'::text]));
alter table attendance_exceptions add constraint "attendance_exceptions_pkey" PRIMARY KEY (exception_date);
alter table attendance_absences add constraint "attendance_absences_check" CHECK (start_time IS NULL AND end_time IS NULL OR start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time);
alter table attendance_absences add constraint "attendance_absences_pkey" PRIMARY KEY (id);
alter table attendance_occurrences add constraint "attendance_occurrences_template_week_index_check" CHECK (template_week_index >= 1 AND template_week_index <= 4);
alter table attendance_occurrences add constraint "attendance_occurrences_activity_check" CHECK (activity = ANY (ARRAY['room'::text, 'conversion'::text, 'external'::text]));
alter table attendance_occurrences add constraint "attendance_occurrences_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'cancelled'::text]));
alter table attendance_occurrences add constraint "attendance_occurrences_sequence_check" CHECK (sequence >= 0);
alter table attendance_occurrences add constraint "attendance_occurrences_check" CHECK (end_time > start_time);
alter table attendance_occurrences add constraint "attendance_occurrences_check1" CHECK (break_start IS NULL AND break_end IS NULL OR break_start IS NOT NULL AND break_end IS NOT NULL AND break_end > break_start AND break_start >= start_time AND break_end <= end_time);
alter table attendance_occurrences add constraint "attendance_occurrences_pkey" PRIMARY KEY (id);
alter table attendance_occurrences add constraint "attendance_occurrences_event_uid_key" UNIQUE (event_uid);
alter table attendance_invite_jobs add constraint "attendance_invite_jobs_operation_check" CHECK (operation = ANY (ARRAY['REQUEST'::text, 'CANCEL'::text]));
alter table attendance_invite_jobs add constraint "attendance_invite_jobs_event_sequence_check" CHECK (event_sequence >= 0);
alter table attendance_invite_jobs add constraint "attendance_invite_jobs_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent_provider'::text, 'failed'::text]));
alter table attendance_invite_jobs add constraint "attendance_invite_jobs_attempts_check" CHECK (attempts >= 0);
alter table attendance_invite_jobs add constraint "attendance_invite_jobs_pkey" PRIMARY KEY (id);
alter table attendance_invite_jobs add constraint "attendance_invite_jobs_idempotency_key_key" UNIQUE (idempotency_key);
alter table attendance_occurrence_history add constraint "attendance_occurrence_history_action_check" CHECK (action = ANY (ARRAY['insert'::text, 'update'::text, 'delete'::text, 'publish'::text, 'cancel'::text, 'reassign'::text]));
alter table attendance_occurrence_history add constraint "attendance_occurrence_history_pkey" PRIMARY KEY (id);
alter table attendance_members add constraint "attendance_members_pkey" PRIMARY KEY (user_id);
alter table calendar_events add constraint "calendar_events_source_type_check" CHECK (source_type = ANY (ARRAY['attendance'::text, 'school_action'::text, 'company_activity'::text]));
alter table calendar_events add constraint "calendar_events_sequence_check" CHECK (sequence >= 0);
alter table calendar_events add constraint "calendar_events_status_check" CHECK (status = ANY (ARRAY['active'::text, 'cancelled'::text]));
alter table calendar_events add constraint "calendar_events_check" CHECK (end_at > start_at);
alter table calendar_events add constraint "calendar_events_pkey" PRIMARY KEY (id);
alter table calendar_events add constraint "calendar_events_event_uid_key" UNIQUE (event_uid);
alter table calendar_events add constraint "calendar_events_source_type_source_id_recipient_user_id_key" UNIQUE (source_type, source_id, recipient_user_id);
alter table calendar_invite_jobs add constraint "calendar_invite_jobs_operation_check" CHECK (operation = ANY (ARRAY['REQUEST'::text, 'CANCEL'::text]));
alter table calendar_invite_jobs add constraint "calendar_invite_jobs_event_sequence_check" CHECK (event_sequence >= 0);
alter table calendar_invite_jobs add constraint "calendar_invite_jobs_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent_provider'::text, 'failed'::text]));
alter table calendar_invite_jobs add constraint "calendar_invite_jobs_attempts_check" CHECK (attempts >= 0);
alter table calendar_invite_jobs add constraint "calendar_invite_jobs_pkey" PRIMARY KEY (id);
alter table calendar_invite_jobs add constraint "calendar_invite_jobs_idempotency_key_key" UNIQUE (idempotency_key);
alter table companies add constraint "companies_next_action_time_check" CHECK (next_action_start_time IS NULL AND next_action_end_time IS NULL OR next_action_start_time IS NOT NULL AND next_action_end_time IS NOT NULL AND next_action_end_time > next_action_start_time);
alter table activities add constraint "activities_sync_status_check" CHECK (sync_status = ANY (ARRAY['pending'::text, 'syncing'::text, 'synced'::text, 'failed'::text]));
alter table activities add constraint "activities_sync_operation_check" CHECK (sync_operation = ANY (ARRAY['create'::text, 'update'::text, 'cancel'::text]));
alter table activities add constraint "activities_meeting_times" CHECK (meeting_type IS NULL OR end_at > start_at);
alter table company_actions add constraint "company_actions_title_check" CHECK (length(btrim(title)) >= 1 AND length(btrim(title)) <= 160);
alter table activities add constraint "activities_meeting_status" CHECK (meeting_type IS NULL OR (status = ANY (ARRAY['agendada'::text, 'confirmada'::text, 'reagendamento_solicitado'::text, 'realizada'::text, 'cancelada'::text, 'nao_compareceu'::text])));
alter table activity_participants add constraint "activity_participants_participant_type_check" CHECK (participant_type = 'optional'::text);
alter table activity_participants add constraint "activity_participants_pkey" PRIMARY KEY (id);
alter table activity_participants add constraint "activity_participants_activity_id_email_key" UNIQUE (activity_id, email);
alter table microsoft_calendar_accounts add constraint "microsoft_calendar_accounts_pkey" PRIMARY KEY (user_id);
alter table microsoft_calendar_accounts add constraint "microsoft_calendar_accounts_microsoft_user_id_key" UNIQUE (microsoft_user_id);
alter table activities add constraint "activities_calendar_provider_check" CHECK (calendar_provider = ANY (ARRAY['email'::text, 'graph'::text]));
alter table activities add constraint "activities_meeting_type_check" CHECK (meeting_type = ANY (ARRAY['presencial'::text, 'teams'::text, 'online'::text]));
alter table calendar_invite_jobs add constraint "calendar_invite_jobs_one_source" CHECK ((calendar_event_id IS NULL) <> (meeting_activity_id IS NULL));
alter table company_actions add constraint "company_actions_action_type_check" CHECK (action_type = ANY (ARRAY['presencial'::text, 'online'::text]));
alter table company_actions add constraint "company_actions_occurred_at_check" CHECK (isfinite(occurred_at));
alter table company_actions add constraint "company_actions_description_check" CHECK (length(btrim(description)) >= 1 AND length(btrim(description)) <= 5000);
alter table company_actions add constraint "company_actions_result_check" CHECK (length(result) <= 2000);
alter table company_actions add constraint "company_actions_notes_check" CHECK (length(notes) <= 5000);
alter table company_actions add constraint "company_actions_location_check" CHECK (length(location) <= 500);
alter table company_actions add constraint "company_actions_channel_check" CHECK (length(channel) <= 100);
alter table company_actions add constraint "company_actions_promotion_url_check" CHECK (length(promotion_url) <= 2048 AND promotion_url ~* '^https?://[^[:space:]]+$'::text);
alter table company_actions add constraint "company_actions_type_fields" CHECK (action_type = 'presencial'::text AND length(btrim(location)) > 0 AND location IS NOT NULL AND channel IS NULL AND promotion_url IS NULL OR action_type = 'online'::text AND length(btrim(channel)) > 0 AND channel IS NOT NULL AND location IS NULL);
alter table company_actions add constraint "company_actions_pkey" PRIMARY KEY (id);
alter table supervest_cycles add constraint "supervest_cycles_capture_academic_year_check" CHECK (capture_academic_year >= 1900 AND capture_academic_year <= 2200);
alter table school_action_grade_results add constraint "school_action_grade_results_pending_registrations_check" CHECK (pending_registrations >= 0);
alter table school_campaigns add constraint "school_campaigns_pkey" PRIMARY KEY (school_id, supervest_cycle_id);
alter table school_campaign_engagements add constraint "school_campaign_engagements_status_check" CHECK (status = ANY (ARRAY['em_contato'::text, 'em_negociacao'::text, 'aguardando_retorno'::text, 'agendamento_conjunto'::text, 'encerrada'::text]));
alter table school_campaign_engagements add constraint "school_campaign_engagements_check" CHECK ((status = 'encerrada'::text) = (ended_at IS NOT NULL));
alter table school_campaign_engagements add constraint "school_campaign_engagements_pkey" PRIMARY KEY (id);
alter table school_campaign_contacts add constraint "school_campaign_contacts_occurred_at_check" CHECK (isfinite(occurred_at));
alter table school_campaign_contacts add constraint "school_campaign_contacts_person_name_check" CHECK (length(TRIM(BOTH FROM person_name)) >= 1 AND length(TRIM(BOTH FROM person_name)) <= 200);
alter table school_campaign_contacts add constraint "school_campaign_contacts_channel_check" CHECK (channel = ANY (ARRAY['Ligação'::text, 'WhatsApp'::text, 'E-mail'::text, 'Visita'::text, 'Outro'::text]));
alter table school_campaign_contacts add constraint "school_campaign_contacts_description_check" CHECK (length(TRIM(BOTH FROM description)) >= 1 AND length(TRIM(BOTH FROM description)) <= 5000);
alter table school_campaign_contacts add constraint "school_campaign_contacts_negotiation_status_check" CHECK (negotiation_status = ANY (ARRAY['em_contato'::text, 'em_negociacao'::text, 'aguardando_retorno'::text, 'agendamento_conjunto'::text]));
alter table school_campaign_contacts add constraint "school_campaign_contacts_return_at_check" CHECK (isfinite(return_at));
alter table school_campaign_contacts add constraint "school_campaign_contacts_check" CHECK (return_at IS NULL OR NULLIF(TRIM(BOTH FROM next_step), ''::text) IS NOT NULL);
alter table school_campaign_contacts add constraint "school_campaign_contacts_pkey" PRIMARY KEY (id);
alter table school_campaign_history add constraint "school_campaign_history_pkey" PRIMARY KEY (id);
alter table companies add constraint "companies_relationship_status_check" CHECK (relationship_status = ANY (ARRAY['active'::text, 'inactive'::text]));
alter table app_settings add constraint "app_settings_b2b_risk_days_check" CHECK (b2b_risk_days >= 1 AND b2b_risk_days <= 90);
alter table app_settings add constraint "app_settings_check" CHECK (b2b_critical_days >= 1 AND b2b_critical_days <= b2b_risk_days);
alter table company_portfolio_history add constraint "company_portfolio_history_kind_check" CHECK (kind = ANY (ARRAY['assignment'::text, 'relationship'::text, 'request'::text]));
alter table company_portfolio_history add constraint "company_portfolio_history_pkey" PRIMARY KEY (id);
alter table company_assignment_requests add constraint "company_assignment_requests_reason_check" CHECK (reason = ANY (ARRAY['Possuo contato'::text, 'Identifiquei oportunidade'::text, 'Empresa da minha região'::text, 'Tenho relacionamento com o responsável'::text, 'Interesse em desenvolver a conta'::text, 'Outro'::text]));
alter table company_assignment_requests add constraint "company_assignment_requests_notes_check" CHECK (length(notes) <= 5000);
alter table company_assignment_requests add constraint "company_assignment_requests_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text]));
alter table company_assignment_requests add constraint "company_assignment_requests_review_notes_check" CHECK (length(review_notes) <= 5000);
alter table company_assignment_requests add constraint "company_assignment_requests_pkey" PRIMARY KEY (id);
alter table company_portfolio_notifications add constraint "company_portfolio_notifications_pkey" PRIMARY KEY (id);
alter table company_portfolio_notifications add constraint "company_portfolio_notifications_user_id_dedupe_key_key" UNIQUE (user_id, dedupe_key);
alter table user_access_history add constraint "user_access_history_action_check" CHECK (action = ANY (ARRAY['recovery_email'::text, 'temporary_password'::text, 'password_changed'::text]));
alter table user_access_history add constraint "user_access_history_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text]));
alter table user_access_history add constraint "user_access_history_pkey" PRIMARY KEY (id);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_pkey ON public.profiles USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS agreements_pkey ON public.agreements USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS agreements_company_id_key ON public.agreements USING btree (company_id);
CREATE UNIQUE INDEX IF NOT EXISTS attachments_pkey ON public.attachments USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS attachments_storage_path_key ON public.attachments USING btree (storage_path);
CREATE INDEX IF NOT EXISTS idx_attachments_entity ON public.attachments USING btree (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_attachments_uploaded_by ON public.attachments USING btree (uploaded_by);
CREATE UNIQUE INDEX IF NOT EXISTS company_contacts_pkey ON public.company_contacts USING btree (id);
CREATE INDEX IF NOT EXISTS company_contacts_company_idx ON public.company_contacts USING btree (company_id);
CREATE UNIQUE INDEX IF NOT EXISTS company_contacts_one_primary ON public.company_contacts USING btree (company_id) WHERE is_primary;
CREATE UNIQUE INDEX IF NOT EXISTS company_contacts_company_id_id ON public.company_contacts USING btree (company_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS app_settings_pkey ON public.app_settings USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS school_stage_history_pkey ON public.school_stage_history USING btree (id);
CREATE INDEX IF NOT EXISTS idx_stage_hist_school ON public.school_stage_history USING btree (school_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_school_stage_history_changed_by ON public.school_stage_history USING btree (changed_by);
CREATE UNIQUE INDEX IF NOT EXISTS school_owner_history_pkey ON public.school_owner_history USING btree (id);
CREATE INDEX IF NOT EXISTS idx_owner_hist_school ON public.school_owner_history USING btree (school_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_school_owner_history_changed_by ON public.school_owner_history USING btree (changed_by);
CREATE INDEX IF NOT EXISTS idx_school_owner_history_new_owner ON public.school_owner_history USING btree (new_owner_id);
CREATE INDEX IF NOT EXISTS idx_school_owner_history_previous_owner ON public.school_owner_history USING btree (previous_owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS commercial_cycles_pkey ON public.commercial_cycles USING btree (id);
CREATE INDEX IF NOT EXISTS idx_commercial_cycles_status ON public.commercial_cycles USING btree (status);
CREATE UNIQUE INDEX IF NOT EXISTS supervest_snapshots_pkey ON public.supervest_snapshots USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_supervest_snapshot_day ON public.supervest_snapshots USING btree (cycle_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_supervest_snapshots_cycle ON public.supervest_snapshots USING btree (cycle_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_supervest_snapshots_entered_by ON public.supervest_snapshots USING btree (entered_by);
CREATE UNIQUE INDEX IF NOT EXISTS school_contacts_pkey ON public.school_contacts USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_school_primary_contact ON public.school_contacts USING btree (school_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS idx_school_contacts_school ON public.school_contacts USING btree (school_id);
CREATE UNIQUE INDEX IF NOT EXISTS grade_levels_pkey ON public.grade_levels USING btree (code);
CREATE UNIQUE INDEX IF NOT EXISTS school_grade_estimates_pkey ON public.school_grade_estimates USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_grade_estimate ON public.school_grade_estimates USING btree (school_id, academic_year, grade);
CREATE INDEX IF NOT EXISTS idx_school_grade_estimates_grade ON public.school_grade_estimates USING btree (grade);
CREATE INDEX IF NOT EXISTS idx_school_grade_estimates_updated_by ON public.school_grade_estimates USING btree (updated_by);
CREATE UNIQUE INDEX IF NOT EXISTS route_stops_pkey ON public.route_stops USING btree (id);
CREATE INDEX IF NOT EXISTS idx_route_stops_plan ON public.route_stops USING btree (route_plan_id, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS goal_types_pkey ON public.goal_types USING btree (code);
CREATE UNIQUE INDEX IF NOT EXISTS goals_pkey ON public.goals USING btree (id);
CREATE INDEX IF NOT EXISTS idx_goals_type ON public.goals USING btree (goal_type);
CREATE INDEX IF NOT EXISTS idx_goals_user ON public.goals USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_goals_scope ON public.goals USING btree (scope_type);
CREATE INDEX IF NOT EXISTS idx_goals_svc ON public.goals USING btree (supervest_cycle_id);
CREATE INDEX IF NOT EXISTS idx_goals_cc ON public.goals USING btree (commercial_cycle_id);
CREATE INDEX IF NOT EXISTS idx_goals_created_by ON public.goals USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_goals_updated_by ON public.goals USING btree (updated_by);
CREATE UNIQUE INDEX IF NOT EXISTS goal_history_pkey ON public.goal_history USING btree (id);
CREATE INDEX IF NOT EXISTS idx_goal_history_goal ON public.goal_history USING btree (goal_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_goal_history_changed_by ON public.goal_history USING btree (changed_by);
CREATE UNIQUE INDEX IF NOT EXISTS goal_week_exceptions_pkey ON public.goal_week_exceptions USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_goal_week_exception ON public.goal_week_exceptions USING btree (user_id, week_start);
CREATE INDEX IF NOT EXISTS idx_goal_week_exceptions_authorized_by ON public.goal_week_exceptions USING btree (authorized_by);
CREATE UNIQUE INDEX IF NOT EXISTS weekly_action_snapshots_pkey ON public.weekly_action_snapshots USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_weekly_snapshot ON public.weekly_action_snapshots USING btree (user_id, week_start);
CREATE INDEX IF NOT EXISTS idx_weekly_snapshot_user ON public.weekly_action_snapshots USING btree (user_id, week_start DESC);
CREATE UNIQUE INDEX IF NOT EXISTS route_user_preferences_pkey ON public.route_user_preferences USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS route_plans_pkey ON public.route_plans USING btree (id);
CREATE INDEX IF NOT EXISTS idx_route_plans_owner_date ON public.route_plans USING btree (owner_id, plan_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_team_slots_pkey ON public.attendance_team_slots USING btree (slot_key);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_rotation_template_pkey ON public.attendance_rotation_template USING btree (week_index, lane, "position");
CREATE UNIQUE INDEX IF NOT EXISTS attendance_cycles_pkey ON public.attendance_cycles USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_exceptions_pkey ON public.attendance_exceptions USING btree (exception_date);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_absences_pkey ON public.attendance_absences USING btree (id);
CREATE INDEX IF NOT EXISTS attendance_absences_user_date_idx ON public.attendance_absences USING btree (user_id, absence_date);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_occurrences_pkey ON public.attendance_occurrences USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_occurrences_event_uid_key ON public.attendance_occurrences USING btree (event_uid);
CREATE INDEX IF NOT EXISTS attendance_occurrences_date_idx ON public.attendance_occurrences USING btree (occurrence_date);
CREATE INDEX IF NOT EXISTS attendance_occurrences_user_date_idx ON public.attendance_occurrences USING btree (user_id, occurrence_date);
CREATE INDEX IF NOT EXISTS attendance_occurrences_cycle_idx ON public.attendance_occurrences USING btree (cycle_id);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_invite_jobs_pkey ON public.attendance_invite_jobs USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_invite_jobs_idempotency_key_key ON public.attendance_invite_jobs USING btree (idempotency_key);
CREATE INDEX IF NOT EXISTS attendance_invite_jobs_status_idx ON public.attendance_invite_jobs USING btree (status, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS attendance_invite_jobs_occurrence_idx ON public.attendance_invite_jobs USING btree (occurrence_id);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_occurrence_history_pkey ON public.attendance_occurrence_history USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_settings_pkey ON public.attendance_settings USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_members_pkey ON public.attendance_members USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_pkey ON public.calendar_events USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_event_uid_key ON public.calendar_events USING btree (event_uid);
CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_source_type_source_id_recipient_user_id_key ON public.calendar_events USING btree (source_type, source_id, recipient_user_id);
CREATE INDEX IF NOT EXISTS calendar_events_source_idx ON public.calendar_events USING btree (source_type, source_id);
CREATE INDEX IF NOT EXISTS calendar_events_recipient_idx ON public.calendar_events USING btree (recipient_user_id, start_at);
CREATE UNIQUE INDEX IF NOT EXISTS calendar_invite_jobs_pkey ON public.calendar_invite_jobs USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS calendar_invite_jobs_idempotency_key_key ON public.calendar_invite_jobs USING btree (idempotency_key);
CREATE INDEX IF NOT EXISTS calendar_invite_jobs_status_idx ON public.calendar_invite_jobs USING btree (status, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS calendar_invite_jobs_event_idx ON public.calendar_invite_jobs USING btree (calendar_event_id);
CREATE INDEX IF NOT EXISTS calendar_invite_jobs_meeting ON public.calendar_invite_jobs USING btree (meeting_activity_id, event_sequence) WHERE (meeting_activity_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_companies_cidade ON public.companies USING btree (cidade);
CREATE UNIQUE INDEX IF NOT EXISTS companies_pkey ON public.companies USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS companies_cnpj_key ON public.companies USING btree (cnpj) WHERE ((cnpj IS NOT NULL) AND (cnpj <> ''::text));
CREATE INDEX IF NOT EXISTS companies_consultor_idx ON public.companies USING btree (consultor);
CREATE INDEX IF NOT EXISTS idx_companies_owner_id ON public.companies USING btree (owner_id);
CREATE INDEX IF NOT EXISTS idx_companies_etapa ON public.companies USING btree (etapa);
CREATE INDEX IF NOT EXISTS idx_companies_geo ON public.companies USING btree (latitude, longitude) WHERE ((latitude IS NOT NULL) AND (longitude IS NOT NULL));
CREATE INDEX IF NOT EXISTS companies_next_action_owner_date_idx ON public.companies USING btree (next_action_owner_id, data_proxima_acao) WHERE ((next_action_owner_id IS NOT NULL) AND (data_proxima_acao IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS activity_participants_pkey ON public.activity_participants USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS activity_participants_activity_id_email_key ON public.activity_participants USING btree (activity_id, email);
CREATE UNIQUE INDEX IF NOT EXISTS microsoft_calendar_accounts_pkey ON public.microsoft_calendar_accounts USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS microsoft_calendar_accounts_microsoft_user_id_key ON public.microsoft_calendar_accounts USING btree (microsoft_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS schools_pkey ON public.schools USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_schools_cnpj ON public.schools USING btree (cnpj) WHERE (cnpj IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_schools_inep ON public.schools USING btree (inep_code) WHERE (inep_code IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_schools_owner ON public.schools USING btree (primary_owner_id);
CREATE INDEX IF NOT EXISTS idx_schools_cidade ON public.schools USING btree (cidade);
CREATE INDEX IF NOT EXISTS idx_schools_stage ON public.schools USING btree (relationship_stage);
CREATE INDEX IF NOT EXISTS idx_schools_geo ON public.schools USING btree (latitude, longitude) WHERE (latitude IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_schools_created_by ON public.schools USING btree (created_by);
CREATE UNIQUE INDEX IF NOT EXISTS activities_pkey ON public.activities USING btree (id);
CREATE INDEX IF NOT EXISTS activities_company_idx ON public.activities USING btree (company_id);
CREATE INDEX IF NOT EXISTS activities_data_idx ON public.activities USING btree (data);
CREATE INDEX IF NOT EXISTS idx_activities_owner_data ON public.activities USING btree (primary_owner_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_activities_company ON public.activities USING btree (company_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_activities_status ON public.activities USING btree (status);
CREATE INDEX IF NOT EXISTS activities_meeting_organizer ON public.activities USING btree (organizer_user_id, start_at) WHERE (meeting_type IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS activities_outlook_event ON public.activities USING btree (organizer_user_id, outlook_event_id) WHERE (outlook_event_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS activities_contact ON public.activities USING btree (contact_id) WHERE (contact_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS activities_calendar_uid ON public.activities USING btree (calendar_uid) WHERE (meeting_type IS NOT NULL);
CREATE INDEX IF NOT EXISTS activities_b2b_completed_idx ON public.activities USING btree (company_id, data DESC, created_at DESC) WHERE (status = 'realizada'::text);
CREATE UNIQUE INDEX IF NOT EXISTS company_actions_pkey ON public.company_actions USING btree (id);
CREATE INDEX IF NOT EXISTS company_actions_company_date_idx ON public.company_actions USING btree (company_id, occurred_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS company_actions_responsible_idx ON public.company_actions USING btree (responsible_user_id);
CREATE INDEX IF NOT EXISTS company_actions_creator_idx ON public.company_actions USING btree (created_by);
CREATE UNIQUE INDEX IF NOT EXISTS supervest_cycles_pkey ON public.supervest_cycles USING btree (id);
CREATE INDEX IF NOT EXISTS idx_supervest_cycles_status ON public.supervest_cycles USING btree (status);
CREATE INDEX IF NOT EXISTS idx_supervest_cycles_created_by ON public.supervest_cycles USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_supervest_cycles_updated_by ON public.supervest_cycles USING btree (updated_by);
CREATE UNIQUE INDEX IF NOT EXISTS supervest_one_active_capture ON public.supervest_cycles USING btree (is_active) WHERE is_active;
CREATE UNIQUE INDEX IF NOT EXISTS school_actions_pkey ON public.school_actions USING btree (id);
CREATE INDEX IF NOT EXISTS idx_school_actions_school ON public.school_actions USING btree (school_id);
CREATE INDEX IF NOT EXISTS idx_school_actions_date ON public.school_actions USING btree (action_date);
CREATE INDEX IF NOT EXISTS idx_school_actions_owner ON public.school_actions USING btree (primary_owner_id);
CREATE INDEX IF NOT EXISTS idx_school_actions_status ON public.school_actions USING btree (status);
CREATE INDEX IF NOT EXISTS idx_school_actions_created_by ON public.school_actions USING btree (created_by);
CREATE INDEX IF NOT EXISTS school_actions_cycle_school_date ON public.school_actions USING btree (supervest_cycle_id, school_id, action_date);
CREATE INDEX IF NOT EXISTS school_actions_contact_idx ON public.school_actions USING btree (school_contact_id);
CREATE INDEX IF NOT EXISTS school_actions_result_author_idx ON public.school_actions USING btree (results_recorded_by);
CREATE UNIQUE INDEX IF NOT EXISTS school_action_participants_pkey ON public.school_action_participants USING btree (school_action_id, user_id);
CREATE INDEX IF NOT EXISTS idx_action_participants_user ON public.school_action_participants USING btree (user_id);
CREATE INDEX IF NOT EXISTS school_action_participants_user_action_idx ON public.school_action_participants USING btree (user_id, school_action_id);
CREATE UNIQUE INDEX IF NOT EXISTS school_action_grade_results_pkey ON public.school_action_grade_results USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_action_grade ON public.school_action_grade_results USING btree (school_action_id, grade);
CREATE INDEX IF NOT EXISTS idx_school_action_grade_results_grade ON public.school_action_grade_results USING btree (grade);
CREATE UNIQUE INDEX IF NOT EXISTS school_action_one_grade_result ON public.school_action_grade_results USING btree (school_action_id, grade);
CREATE UNIQUE INDEX IF NOT EXISTS school_campaigns_pkey ON public.school_campaigns USING btree (school_id, supervest_cycle_id);
CREATE UNIQUE INDEX IF NOT EXISTS school_campaign_contacts_pkey ON public.school_campaign_contacts USING btree (id);
CREATE INDEX IF NOT EXISTS school_campaign_contacts_cycle_idx ON public.school_campaign_contacts USING btree (supervest_cycle_id, school_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS school_campaign_contacts_consultant_idx ON public.school_campaign_contacts USING btree (consultant_id);
CREATE INDEX IF NOT EXISTS school_campaign_contacts_person_idx ON public.school_campaign_contacts USING btree (institutional_contact_id);
CREATE INDEX IF NOT EXISTS school_campaign_contacts_creator_idx ON public.school_campaign_contacts USING btree (created_by);
CREATE UNIQUE INDEX IF NOT EXISTS school_campaign_engagements_pkey ON public.school_campaign_engagements USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS school_campaign_one_open_engagement ON public.school_campaign_engagements USING btree (school_id, supervest_cycle_id, user_id) WHERE (ended_at IS NULL);
CREATE INDEX IF NOT EXISTS school_campaign_engagement_cycle_idx ON public.school_campaign_engagements USING btree (supervest_cycle_id, school_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS school_campaign_engagement_user_idx ON public.school_campaign_engagements USING btree (user_id);
CREATE INDEX IF NOT EXISTS school_campaign_engagement_creator_idx ON public.school_campaign_engagements USING btree (created_by);
CREATE INDEX IF NOT EXISTS school_campaign_engagement_closer_idx ON public.school_campaign_engagements USING btree (closed_by);
CREATE UNIQUE INDEX IF NOT EXISTS school_campaign_history_pkey ON public.school_campaign_history USING btree (id);
CREATE INDEX IF NOT EXISTS school_campaign_history_cycle_idx ON public.school_campaign_history USING btree (supervest_cycle_id, school_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS school_campaign_history_actor_idx ON public.school_campaign_history USING btree (actor_id);
CREATE UNIQUE INDEX IF NOT EXISTS company_portfolio_history_pkey ON public.company_portfolio_history USING btree (id);
CREATE INDEX IF NOT EXISTS company_portfolio_history_company_idx ON public.company_portfolio_history USING btree (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS company_portfolio_history_actor_idx ON public.company_portfolio_history USING btree (changed_by);
CREATE INDEX IF NOT EXISTS company_portfolio_history_kind_date_idx ON public.company_portfolio_history USING btree (kind, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS company_assignment_requests_pkey ON public.company_assignment_requests USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS company_assignment_requests_one_pending ON public.company_assignment_requests USING btree (company_id) WHERE (status = 'pending'::text);
CREATE INDEX IF NOT EXISTS company_assignment_requests_user_idx ON public.company_assignment_requests USING btree (requested_by, created_at DESC);
CREATE INDEX IF NOT EXISTS company_assignment_requests_review_idx ON public.company_assignment_requests USING btree (reviewed_by);
CREATE INDEX IF NOT EXISTS company_assignment_requests_previous_idx ON public.company_assignment_requests USING btree (previous_owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS company_portfolio_notifications_pkey ON public.company_portfolio_notifications USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS company_portfolio_notifications_user_id_dedupe_key_key ON public.company_portfolio_notifications USING btree (user_id, dedupe_key);
CREATE INDEX IF NOT EXISTS company_portfolio_notifications_user_idx ON public.company_portfolio_notifications USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS company_portfolio_notifications_company_idx ON public.company_portfolio_notifications USING btree (company_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_access_history_pkey ON public.user_access_history USING btree (id);
CREATE INDEX IF NOT EXISTS user_access_history_target_created ON public.user_access_history USING btree (target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_access_history_actor ON public.user_access_history USING btree (actor_id);
alter table school_stage_history add constraint "school_stage_history_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES profiles(id);
alter table school_owner_history add constraint "school_owner_history_school_id_fkey" FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
alter table profiles add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table companies add constraint "companies_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table company_contacts add constraint "company_contacts_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table activities add constraint "activities_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table agreements add constraint "agreements_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table school_owner_history add constraint "school_owner_history_previous_owner_id_fkey" FOREIGN KEY (previous_owner_id) REFERENCES profiles(id);
alter table school_owner_history add constraint "school_owner_history_new_owner_id_fkey" FOREIGN KEY (new_owner_id) REFERENCES profiles(id);
alter table school_owner_history add constraint "school_owner_history_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES profiles(id);
alter table school_contacts add constraint "school_contacts_school_id_fkey" FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
alter table school_grade_estimates add constraint "school_grade_estimates_school_id_fkey" FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
alter table activities add constraint "activities_primary_owner_id_fkey" FOREIGN KEY (primary_owner_id) REFERENCES profiles(id);
alter table attachments add constraint "attachments_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES profiles(id);
alter table schools add constraint "schools_primary_owner_id_fkey" FOREIGN KEY (primary_owner_id) REFERENCES profiles(id);
alter table schools add constraint "schools_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table school_stage_history add constraint "school_stage_history_school_id_fkey" FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
alter table school_grade_estimates add constraint "school_grade_estimates_grade_fkey" FOREIGN KEY (grade) REFERENCES grade_levels(code);
alter table school_grade_estimates add constraint "school_grade_estimates_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES profiles(id);
alter table school_actions add constraint "school_actions_school_id_fkey" FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
alter table school_actions add constraint "school_actions_primary_owner_id_fkey" FOREIGN KEY (primary_owner_id) REFERENCES profiles(id);
alter table school_actions add constraint "school_actions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table school_action_participants add constraint "school_action_participants_school_action_id_fkey" FOREIGN KEY (school_action_id) REFERENCES school_actions(id) ON DELETE CASCADE;
alter table school_action_participants add constraint "school_action_participants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table school_action_grade_results add constraint "school_action_grade_results_school_action_id_fkey" FOREIGN KEY (school_action_id) REFERENCES school_actions(id) ON DELETE CASCADE;
alter table school_action_grade_results add constraint "school_action_grade_results_grade_fkey" FOREIGN KEY (grade) REFERENCES grade_levels(code);
alter table supervest_cycles add constraint "supervest_cycles_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table supervest_cycles add constraint "supervest_cycles_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES profiles(id);
alter table supervest_snapshots add constraint "supervest_snapshots_cycle_id_fkey" FOREIGN KEY (cycle_id) REFERENCES supervest_cycles(id) ON DELETE CASCADE;
alter table supervest_snapshots add constraint "supervest_snapshots_entered_by_fkey" FOREIGN KEY (entered_by) REFERENCES profiles(id);
alter table goals add constraint "goals_goal_type_fkey" FOREIGN KEY (goal_type) REFERENCES goal_types(code);
alter table goals add constraint "goals_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id);
alter table goals add constraint "goals_commercial_cycle_id_fkey" FOREIGN KEY (commercial_cycle_id) REFERENCES commercial_cycles(id);
alter table goals add constraint "goals_supervest_cycle_id_fkey" FOREIGN KEY (supervest_cycle_id) REFERENCES supervest_cycles(id);
alter table goals add constraint "goals_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table goals add constraint "goals_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES profiles(id);
alter table goal_history add constraint "goal_history_goal_id_fkey" FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE;
alter table goal_history add constraint "goal_history_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES profiles(id);
alter table goal_week_exceptions add constraint "goal_week_exceptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table goal_week_exceptions add constraint "goal_week_exceptions_authorized_by_fkey" FOREIGN KEY (authorized_by) REFERENCES profiles(id);
alter table weekly_action_snapshots add constraint "weekly_action_snapshots_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table route_plans add constraint "route_plans_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES profiles(id);
alter table route_stops add constraint "route_stops_route_plan_id_fkey" FOREIGN KEY (route_plan_id) REFERENCES route_plans(id) ON DELETE CASCADE;
alter table route_user_preferences add constraint "route_user_preferences_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table attendance_settings add constraint "attendance_settings_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table attendance_team_slots add constraint "attendance_team_slots_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table attendance_team_slots add constraint "attendance_team_slots_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table attendance_rotation_template add constraint "attendance_rotation_template_slot_key_fkey" FOREIGN KEY (slot_key) REFERENCES attendance_team_slots(slot_key) ON UPDATE CASCADE ON DELETE RESTRICT;
alter table attendance_rotation_template add constraint "attendance_rotation_template_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table school_campaign_history add constraint "school_campaign_history_school_id_fkey" FOREIGN KEY (school_id) REFERENCES schools(id);
alter table attendance_cycles add constraint "attendance_cycles_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE RESTRICT;
alter table attendance_cycles add constraint "attendance_cycles_published_by_fkey" FOREIGN KEY (published_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table attendance_exceptions add constraint "attendance_exceptions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE RESTRICT;
alter table attendance_absences add constraint "attendance_absences_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table attendance_absences add constraint "attendance_absences_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE RESTRICT;
alter table attendance_occurrences add constraint "attendance_occurrences_cycle_id_fkey" FOREIGN KEY (cycle_id) REFERENCES attendance_cycles(id) ON DELETE SET NULL;
alter table attendance_occurrences add constraint "attendance_occurrences_slot_key_fkey" FOREIGN KEY (slot_key) REFERENCES attendance_team_slots(slot_key) ON UPDATE CASCADE ON DELETE SET NULL;
alter table attendance_occurrences add constraint "attendance_occurrences_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table attendance_occurrences add constraint "attendance_occurrences_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE RESTRICT;
alter table attendance_occurrences add constraint "attendance_occurrences_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table attendance_occurrences add constraint "attendance_occurrences_published_by_fkey" FOREIGN KEY (published_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table attendance_invite_jobs add constraint "attendance_invite_jobs_occurrence_id_fkey" FOREIGN KEY (occurrence_id) REFERENCES attendance_occurrences(id) ON DELETE CASCADE;
alter table attendance_invite_jobs add constraint "attendance_invite_jobs_recipient_user_id_fkey" FOREIGN KEY (recipient_user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table school_campaign_history add constraint "school_campaign_history_supervest_cycle_id_fkey" FOREIGN KEY (supervest_cycle_id) REFERENCES supervest_cycles(id);
alter table attendance_occurrence_history add constraint "attendance_occurrence_history_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table attendance_members add constraint "attendance_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table attendance_members add constraint "attendance_members_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table calendar_events add constraint "calendar_events_recipient_user_id_fkey" FOREIGN KEY (recipient_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table calendar_events add constraint "calendar_events_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table calendar_events add constraint "calendar_events_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table calendar_invite_jobs add constraint "calendar_invite_jobs_calendar_event_id_fkey" FOREIGN KEY (calendar_event_id) REFERENCES calendar_events(id) ON DELETE CASCADE;
alter table companies add constraint "companies_next_action_owner_id_fkey" FOREIGN KEY (next_action_owner_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table activities add constraint "activities_organizer_user_id_fkey" FOREIGN KEY (organizer_user_id) REFERENCES profiles(id);
alter table activities add constraint "activities_contact_company_fk" FOREIGN KEY (company_id, contact_id) REFERENCES company_contacts(company_id, id) ON DELETE RESTRICT;
alter table activity_participants add constraint "activity_participants_activity_id_fkey" FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE;
alter table microsoft_calendar_accounts add constraint "microsoft_calendar_accounts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table calendar_invite_jobs add constraint "calendar_invite_jobs_meeting_activity_id_fkey" FOREIGN KEY (meeting_activity_id) REFERENCES activities(id) ON DELETE RESTRICT;
alter table company_actions add constraint "company_actions_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
alter table company_actions add constraint "company_actions_responsible_user_id_fkey" FOREIGN KEY (responsible_user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table company_actions add constraint "company_actions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table school_campaign_contacts add constraint "school_campaign_contacts_consultant_id_fkey" FOREIGN KEY (consultant_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table school_campaign_contacts add constraint "school_campaign_contacts_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table school_actions add constraint "school_actions_school_contact_id_fkey" FOREIGN KEY (school_contact_id) REFERENCES school_contacts(id);
alter table school_actions add constraint "school_actions_results_recorded_by_fkey" FOREIGN KEY (results_recorded_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table school_actions add constraint "school_action_supervest_fk" FOREIGN KEY (supervest_cycle_id) REFERENCES supervest_cycles(id);
alter table school_campaigns add constraint "school_campaigns_school_id_fkey" FOREIGN KEY (school_id) REFERENCES schools(id);
alter table school_campaigns add constraint "school_campaigns_supervest_cycle_id_fkey" FOREIGN KEY (supervest_cycle_id) REFERENCES supervest_cycles(id);
alter table school_campaigns add constraint "school_campaigns_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table school_actions add constraint "school_action_campaign_fk" FOREIGN KEY (school_id, supervest_cycle_id) REFERENCES school_campaigns(school_id, supervest_cycle_id);
alter table school_campaign_engagements add constraint "school_campaign_engagements_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table school_campaign_engagements add constraint "school_campaign_engagements_closed_by_fkey" FOREIGN KEY (closed_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table school_campaign_engagements add constraint "school_campaign_engagements_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table school_campaign_engagements add constraint "school_campaign_engagements_school_id_supervest_cycle_id_fkey" FOREIGN KEY (school_id, supervest_cycle_id) REFERENCES school_campaigns(school_id, supervest_cycle_id);
alter table school_campaign_contacts add constraint "school_campaign_contacts_school_id_supervest_cycle_id_fkey" FOREIGN KEY (school_id, supervest_cycle_id) REFERENCES school_campaigns(school_id, supervest_cycle_id);
alter table school_campaign_contacts add constraint "school_campaign_contacts_institutional_contact_id_fkey" FOREIGN KEY (institutional_contact_id) REFERENCES school_contacts(id);
alter table school_campaign_history add constraint "school_campaign_history_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table company_portfolio_history add constraint "company_portfolio_history_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
alter table company_portfolio_history add constraint "company_portfolio_history_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES profiles(id) ON DELETE RESTRICT;
alter table company_assignment_requests add constraint "company_assignment_requests_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
alter table company_assignment_requests add constraint "company_assignment_requests_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES profiles(id) ON DELETE RESTRICT;
alter table company_assignment_requests add constraint "company_assignment_requests_previous_owner_id_fkey" FOREIGN KEY (previous_owner_id) REFERENCES profiles(id) ON DELETE RESTRICT;
alter table company_assignment_requests add constraint "company_assignment_requests_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE RESTRICT;
alter table company_portfolio_notifications add constraint "company_portfolio_notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE RESTRICT;
alter table company_portfolio_notifications add constraint "company_portfolio_notifications_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
alter table user_access_history add constraint "user_access_history_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES profiles(id);
alter table user_access_history add constraint "user_access_history_target_id_fkey" FOREIGN KEY (target_id) REFERENCES profiles(id);
create view "public"."b2b_company_portfolio" with (security_invoker=true) as  WITH base AS (
         SELECT c.id,
            c.razao_social,
            c.nome_fantasia,
            c.cnpj,
            c.segmento,
            c.colaboradores,
            c.cidade,
            c.bairro,
            c.telefone,
            c.site,
            c.origem,
            c.classificacao,
            c.etapa,
            c.potencial,
            c.possui_beneficio,
            c.observacoes,
            c.consultor,
            c.owner_id,
            c.ultimo_contato,
            c.proxima_acao,
            c.data_proxima_acao,
            c.data_entrada,
            c.link_inscricao,
            c.link_consultor,
            c.created_at,
            c.updated_at,
            c.logradouro,
            c.numero,
            c.complemento,
            c.cep,
            c.latitude,
            c.longitude,
            c.geocoded_at,
            c.geocode_precision,
            c.geocode_hash,
            c.next_action_start_time,
            c.next_action_end_time,
            c.next_action_location,
            c.next_action_owner_id,
            c.relationship_status,
            c.relationship_changed_at,
            COALESCE(NULLIF(c.nome_fantasia, ''::text), c.razao_social) AS company_name,
            COALESCE(private.b2b_name(c.owner_id), 'Sem responsável'::text) AS owner_name,
            COALESCE(private.b2b_name(c.owner_id), ( SELECT h.previous_value ->> 'name'::text
                   FROM company_portfolio_history h
                  WHERE h.company_id = c.id AND h.kind = 'assignment'::text AND NULLIF(h.previous_value ->> 'name'::text, ''::text) IS NOT NULL
                  ORDER BY h.created_at DESC, h.id DESC
                 LIMIT 1), NULLIF(c.consultor, ''::text)) AS last_owner_name,
                CASE
                    WHEN g.ativo AND g.status <> 'Encerrado'::text THEN 'Conveniada'::text
                    WHEN g.status = 'Encerrado'::text OR (c.etapa = ANY (ARRAY['Perdida'::text, 'Sem potencial'::text])) THEN 'Não conveniada'::text
                    WHEN c.etapa = ANY (ARRAY['Novo'::text, 'Mapeada'::text]) THEN 'Mapeada'::text
                    ELSE 'Em negociação'::text
                END AS agreement_status,
            a.id AS last_action_id,
            a.source AS last_action_source,
            a.action_type AS last_action_type,
            a.action_date AS last_action_date,
            a.user_name AS last_action_user,
            b2b_commercial_cycle(a.action_date) AS last_action_cycle,
            b2b_commercial_cycle((now() AT TIME ZONE 'America/Sao_Paulo'::text)::date) AS current_cycle,
            private.b2b_has_pending(c.id) AS pending_request,
            COALESCE(( SELECT s.b2b_risk_days
                   FROM app_settings s
                  WHERE s.id = 1), 30) AS risk_days,
            COALESCE(( SELECT s.b2b_critical_days
                   FROM app_settings s
                  WHERE s.id = 1), 15) AS critical_days
           FROM companies c
             LEFT JOIN agreements g ON g.company_id = c.id
             LEFT JOIN LATERAL b2b_last_valid_activity(c.id, (now() AT TIME ZONE 'America/Sao_Paulo'::text)::date) a(id, source, action_type, action_date, user_id, user_name) ON true
        ), state AS (
         SELECT base.id,
            base.razao_social,
            base.nome_fantasia,
            base.cnpj,
            base.segmento,
            base.colaboradores,
            base.cidade,
            base.bairro,
            base.telefone,
            base.site,
            base.origem,
            base.classificacao,
            base.etapa,
            base.potencial,
            base.possui_beneficio,
            base.observacoes,
            base.consultor,
            base.owner_id,
            base.ultimo_contato,
            base.proxima_acao,
            base.data_proxima_acao,
            base.data_entrada,
            base.link_inscricao,
            base.link_consultor,
            base.created_at,
            base.updated_at,
            base.logradouro,
            base.numero,
            base.complemento,
            base.cep,
            base.latitude,
            base.longitude,
            base.geocoded_at,
            base.geocode_precision,
            base.geocode_hash,
            base.next_action_start_time,
            base.next_action_end_time,
            base.next_action_location,
            base.next_action_owner_id,
            base.relationship_status,
            base.relationship_changed_at,
            base.company_name,
            base.owner_name,
            base.last_owner_name,
            base.agreement_status,
            base.last_action_id,
            base.last_action_source,
            base.last_action_type,
            base.last_action_date,
            base.last_action_user,
            base.last_action_cycle,
            base.current_cycle,
            base.pending_request,
            base.risk_days,
            base.critical_days,
                CASE
                    WHEN base.owner_id IS NOT NULL AND base.relationship_status = 'active'::text AND base.last_action_date IS NOT NULL AND (((base.current_cycle ->> 'ordinal'::text)::integer) - ((base.last_action_cycle ->> 'ordinal'::text)::integer)) < 2 THEN 'active'::text
                    ELSE 'inactive'::text
                END AS effective_relationship,
            COALESCE((base.last_action_cycle ->> 'code'::text) = (base.current_cycle ->> 'code'::text), false) AS has_action_current_cycle,
            ((base.current_cycle ->> 'end'::text)::date) - (now() AT TIME ZONE 'America/Sao_Paulo'::text)::date AS days_to_cycle_end,
            base.data_proxima_acao >= (now() AT TIME ZONE 'America/Sao_Paulo'::text)::date AND NULLIF(btrim(base.proxima_acao), ''::text) IS NOT NULL OR (EXISTS ( SELECT 1
                   FROM activities m
                  WHERE m.company_id = base.id AND m.meeting_type IS NOT NULL AND (m.status = ANY (ARRAY['agendada'::text, 'confirmada'::text, 'reagendamento_solicitado'::text])) AND m.end_at > now())) AS has_next_action
           FROM base
        )
 SELECT id,
    razao_social,
    nome_fantasia,
    cnpj,
    segmento,
    colaboradores,
    cidade,
    bairro,
    telefone,
    site,
    origem,
    classificacao,
    etapa,
    potencial,
    possui_beneficio,
    observacoes,
    consultor,
    owner_id,
    ultimo_contato,
    proxima_acao,
    data_proxima_acao,
    data_entrada,
    link_inscricao,
    link_consultor,
    created_at,
    updated_at,
    logradouro,
    numero,
    complemento,
    cep,
    latitude,
    longitude,
    geocoded_at,
    geocode_precision,
    geocode_hash,
    next_action_start_time,
    next_action_end_time,
    next_action_location,
    next_action_owner_id,
    relationship_status,
    relationship_changed_at,
    company_name,
    owner_name,
    last_owner_name,
    agreement_status,
    last_action_id,
    last_action_source,
    last_action_type,
    last_action_date,
    last_action_user,
    last_action_cycle,
    current_cycle,
    pending_request,
    risk_days,
    critical_days,
    effective_relationship,
    has_action_current_cycle,
    days_to_cycle_end,
    has_next_action,
        CASE
            WHEN effective_relationship = 'inactive'::text THEN 'Sem relacionamento'::text
            WHEN has_action_current_cycle THEN 'Saudável'::text
            WHEN days_to_cycle_end <= critical_days THEN 'Crítico'::text
            ELSE 'Atenção'::text
        END AS relationship_health,
    effective_relationship = 'active'::text AND NOT has_action_current_cycle AND days_to_cycle_end <= risk_days AS at_risk,
        CASE
            WHEN effective_relationship = 'inactive'::text THEN 3
            WHEN NOT has_action_current_cycle AND days_to_cycle_end <= critical_days THEN 0
            WHEN NOT has_action_current_cycle AND days_to_cycle_end <= risk_days THEN 1
            WHEN NOT has_action_current_cycle THEN 2
            WHEN NOT has_next_action THEN 4
            ELSE 5
        END AS priority,
        CASE
            WHEN last_action_date IS NULL THEN NULL::integer
            ELSE (now() AT TIME ZONE 'America/Sao_Paulo'::text)::date - last_action_date
        END AS days_since_action,
        CASE
            WHEN effective_relationship = 'inactive'::text THEN (now() AT TIME ZONE 'America/Sao_Paulo'::text)::date - (relationship_changed_at AT TIME ZONE 'America/Sao_Paulo'::text)::date
            ELSE NULL::integer
        END AS days_inactive
   FROM state;;
create view "public"."b2b_activities_with_cycle" with (security_invoker=true) as  SELECT id,
    company_id,
    consultor,
    data,
    tipo,
    contato,
    resultado,
    observacao,
    leads,
    impactados,
    etapa_anterior,
    etapa_nova,
    proxima_acao,
    data_proximo_contato,
    created_at,
    updated_at,
    status,
    primary_owner_id,
    conta_meta_semanal,
    contact_id,
    organizer_user_id,
    organizer_name,
    organizer_email,
    contact_email,
    meeting_type,
    title,
    description,
    start_at,
    end_at,
    location,
    outlook_event_id,
    outlook_web_url,
    outlook_change_key,
    teams_meeting_url,
    revision,
    sync_status,
    sync_error,
    sync_operation,
    sync_payload,
    sync_lock,
    sync_locked_at,
    meeting_rsvp,
    calendar_provider,
    calendar_uid,
    calendar_organizer_email,
    meeting_url,
    email_queued_revision,
    b2b_commercial_cycle(data) AS commercial_cycle
   FROM activities a;;
create view "public"."b2b_actions_with_cycle" with (security_invoker=true) as  SELECT id,
    company_id,
    action_type,
    title,
    occurred_at,
    responsible_user_id,
    responsible_name,
    description,
    result,
    notes,
    location,
    channel,
    promotion_url,
    created_by,
    creator_name,
    created_at,
    b2b_commercial_cycle((occurred_at AT TIME ZONE 'America/Sao_Paulo'::text)::date) AS commercial_cycle
   FROM company_actions a;;
create policy "activities_insert" on "public"."activities" as PERMISSIVE for INSERT to authenticated with check ((( SELECT is_manager() AS is_manager) OR (EXISTS ( SELECT 1
   FROM companies c
  WHERE ((c.id = activities.company_id) AND (c.owner_id = ( SELECT auth.uid() AS uid)))))));
create policy "activities_update" on "public"."activities" as PERMISSIVE for UPDATE to authenticated using ((( SELECT is_manager() AS is_manager) OR (EXISTS ( SELECT 1
   FROM companies c
  WHERE ((c.id = activities.company_id) AND (c.owner_id = ( SELECT auth.uid() AS uid))))))) with check ((( SELECT is_manager() AS is_manager) OR (EXISTS ( SELECT 1
   FROM companies c
  WHERE ((c.id = activities.company_id) AND (c.owner_id = ( SELECT auth.uid() AS uid)))))));
create policy "activities_delete" on "public"."activities" as PERMISSIVE for DELETE to authenticated using ((( SELECT is_manager() AS is_manager) OR (EXISTS ( SELECT 1
   FROM companies c
  WHERE ((c.id = activities.company_id) AND (c.owner_id = ( SELECT auth.uid() AS uid)))))));
create policy "goals_insert" on "public"."goals" as PERMISSIVE for INSERT to authenticated with check (( SELECT is_manager() AS is_manager));
create policy "companies_select" on "public"."companies" as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "agreements_insert" on "public"."agreements" as PERMISSIVE for INSERT to authenticated with check ((( SELECT is_manager() AS is_manager) OR (EXISTS ( SELECT 1
   FROM companies c
  WHERE ((c.id = agreements.company_id) AND (c.owner_id = ( SELECT auth.uid() AS uid)))))));
create policy "agreements_update" on "public"."agreements" as PERMISSIVE for UPDATE to authenticated using ((( SELECT is_manager() AS is_manager) OR (EXISTS ( SELECT 1
   FROM companies c
  WHERE ((c.id = agreements.company_id) AND (c.owner_id = ( SELECT auth.uid() AS uid))))))) with check ((( SELECT is_manager() AS is_manager) OR (EXISTS ( SELECT 1
   FROM companies c
  WHERE ((c.id = agreements.company_id) AND (c.owner_id = ( SELECT auth.uid() AS uid)))))));
create policy "agreements_delete" on "public"."agreements" as PERMISSIVE for DELETE to authenticated using ((( SELECT is_manager() AS is_manager) OR (EXISTS ( SELECT 1
   FROM companies c
  WHERE ((c.id = agreements.company_id) AND (c.owner_id = ( SELECT auth.uid() AS uid)))))));
create policy "settings_insert" on "public"."app_settings" as PERMISSIVE for INSERT to authenticated with check (( SELECT is_manager() AS is_manager));
create policy "sagr_delete" on "public"."school_action_grade_results" as PERMISSIVE for DELETE to authenticated using (( SELECT is_high_school_writer() AS is_high_school_writer));
create policy "settings_update" on "public"."app_settings" as PERMISSIVE for UPDATE to authenticated using (( SELECT is_manager() AS is_manager)) with check (( SELECT is_manager() AS is_manager));
create policy "settings_delete" on "public"."app_settings" as PERMISSIVE for DELETE to authenticated using (( SELECT is_manager() AS is_manager));
create policy "cc_insert" on "public"."commercial_cycles" as PERMISSIVE for INSERT to authenticated with check (( SELECT is_manager() AS is_manager));
create policy "cc_update" on "public"."commercial_cycles" as PERMISSIVE for UPDATE to authenticated using (( SELECT is_manager() AS is_manager)) with check (( SELECT is_manager() AS is_manager));
create policy "cc_delete" on "public"."commercial_cycles" as PERMISSIVE for DELETE to authenticated using (( SELECT is_manager() AS is_manager));
create policy "contacts_insert" on "public"."company_contacts" as PERMISSIVE for INSERT to authenticated with check ((( SELECT is_manager() AS is_manager) OR (EXISTS ( SELECT 1
   FROM companies c
  WHERE ((c.id = company_contacts.company_id) AND (c.owner_id = ( SELECT auth.uid() AS uid)))))));
create policy "contacts_update" on "public"."company_contacts" as PERMISSIVE for UPDATE to authenticated using ((( SELECT is_manager() AS is_manager) OR (EXISTS ( SELECT 1
   FROM companies c
  WHERE ((c.id = company_contacts.company_id) AND (c.owner_id = ( SELECT auth.uid() AS uid))))))) with check ((( SELECT is_manager() AS is_manager) OR (EXISTS ( SELECT 1
   FROM companies c
  WHERE ((c.id = company_contacts.company_id) AND (c.owner_id = ( SELECT auth.uid() AS uid)))))));
create policy "contacts_delete" on "public"."company_contacts" as PERMISSIVE for DELETE to authenticated using ((( SELECT is_manager() AS is_manager) OR (EXISTS ( SELECT 1
   FROM companies c
  WHERE ((c.id = company_contacts.company_id) AND (c.owner_id = ( SELECT auth.uid() AS uid)))))));
create policy "gt_insert" on "public"."goal_types" as PERMISSIVE for INSERT to authenticated with check (( SELECT is_manager() AS is_manager));
create policy "sap_insert" on "public"."school_action_participants" as PERMISSIVE for INSERT to authenticated with check (( SELECT is_high_school_writer() AS is_high_school_writer));
create policy "gt_update" on "public"."goal_types" as PERMISSIVE for UPDATE to authenticated using (( SELECT is_manager() AS is_manager)) with check (( SELECT is_manager() AS is_manager));
create policy "gt_delete" on "public"."goal_types" as PERMISSIVE for DELETE to authenticated using (( SELECT is_manager() AS is_manager));
create policy "gwe_insert" on "public"."goal_week_exceptions" as PERMISSIVE for INSERT to authenticated with check (( SELECT is_manager() AS is_manager));
create policy "gwe_update" on "public"."goal_week_exceptions" as PERMISSIVE for UPDATE to authenticated using (( SELECT is_manager() AS is_manager)) with check (( SELECT is_manager() AS is_manager));
create policy "attendance_settings_read" on "public"."attendance_settings" as PERMISSIVE for SELECT to authenticated using (true);
create policy "attachments_delete" on "public"."attachments" as PERMISSIVE for DELETE to authenticated using (((uploaded_by = ( SELECT auth.uid() AS uid)) OR ( SELECT is_manager() AS is_manager)));
create policy "companies_insert" on "public"."companies" as PERMISSIVE for INSERT to authenticated with check (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (( SELECT is_manager() AS is_manager) OR (owner_id = ( SELECT auth.uid() AS uid)))));
create policy "companies_delete" on "public"."companies" as PERMISSIVE for DELETE to authenticated using (( SELECT is_manager() AS is_manager));
create policy "contacts_select" on "public"."company_contacts" as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "activities_select" on "public"."activities" as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "attendance_members_read" on "public"."attendance_members" as PERMISSIVE for SELECT to authenticated using (true);
create policy "attendance_rotation_template_manager_insert" on "public"."attendance_rotation_template" as PERMISSIVE for INSERT to authenticated with check (( SELECT is_manager() AS is_manager));
create policy "agreements_select" on "public"."agreements" as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "settings_select" on "public"."app_settings" as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "attachments_insert" on "public"."attachments" as PERMISSIVE for INSERT to authenticated with check ((uploaded_by = ( SELECT auth.uid() AS uid)));
create policy "calendar_jobs_b2b_insert_backend" on "public"."calendar_invite_jobs" as RESTRICTIVE for INSERT to authenticated with check ((meeting_activity_id IS NULL));
create policy "calendar_jobs_b2b_update_backend" on "public"."calendar_invite_jobs" as RESTRICTIVE for UPDATE to authenticated using ((meeting_activity_id IS NULL)) with check ((meeting_activity_id IS NULL));
create policy "calendar_jobs_b2b_delete_backend" on "public"."calendar_invite_jobs" as RESTRICTIVE for DELETE to authenticated using ((meeting_activity_id IS NULL));
create policy "profiles_select" on "public"."profiles" as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "profiles_insert" on "public"."profiles" as PERMISSIVE for INSERT to authenticated with check ((( SELECT is_manager() AS is_manager) OR (id = ( SELECT auth.uid() AS uid))));
create policy "profiles_update" on "public"."profiles" as PERMISSIVE for UPDATE to authenticated using ((( SELECT is_manager() AS is_manager) OR (id = ( SELECT auth.uid() AS uid))));
create policy "profiles_delete" on "public"."profiles" as PERMISSIVE for DELETE to authenticated using (( SELECT is_manager() AS is_manager));
create policy "attachments_select" on "public"."attachments" as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "sagr_select" on "public"."school_action_grade_results" as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "schools_select" on "public"."schools" as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "schools_insert" on "public"."schools" as PERMISSIVE for INSERT to authenticated with check (( SELECT is_high_school_writer() AS is_high_school_writer));
create policy "schools_update" on "public"."schools" as PERMISSIVE for UPDATE to authenticated using (( SELECT is_high_school_writer() AS is_high_school_writer));
create policy "schools_delete" on "public"."schools" as PERMISSIVE for DELETE to authenticated using (( SELECT is_manager() AS is_manager));
create policy "stage_hist_select" on "public"."school_stage_history" as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "owner_hist_select" on "public"."school_owner_history" as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "sc_select" on "public"."school_contacts" as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "gl_select" on "public"."grade_levels" as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "sge_select" on "public"."school_grade_estimates" as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "sa_select" on "public"."school_actions" as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "sa_insert" on "public"."school_actions" as PERMISSIVE for INSERT to authenticated with check (( SELECT is_high_school_writer() AS is_high_school_writer));
create policy "sa_update" on "public"."school_actions" as PERMISSIVE for UPDATE to authenticated using (( SELECT is_high_school_writer() AS is_high_school_writer));
create policy "sa_delete" on "public"."school_actions" as PERMISSIVE for DELETE to authenticated using (( SELECT is_manager() AS is_manager));
create policy "sap_select" on "public"."school_action_participants" as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "was_select" on "public"."weekly_action_snapshots" as PERMISSIVE for SELECT to authenticated using ((( SELECT is_manager() AS is_manager) OR (user_id = ( SELECT auth.uid() AS uid))));
create policy "cc_select" on "public"."commercial_cycles" as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "sv_select" on "public"."supervest_cycles" as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "sv_insert" on "public"."supervest_cycles" as PERMISSIVE for INSERT to authenticated with check (( SELECT is_high_school_writer() AS is_high_school_writer));
create policy "sv_update" on "public"."supervest_cycles" as PERMISSIVE for UPDATE to authenticated using (( SELECT is_high_school_writer() AS is_high_school_writer));
create policy "sv_delete" on "public"."supervest_cycles" as PERMISSIVE for DELETE to authenticated using (( SELECT is_manager() AS is_manager));
create policy "svs_select" on "public"."supervest_snapshots" as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "gt_select" on "public"."goal_types" as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "goals_select" on "public"."goals" as PERMISSIVE for SELECT to authenticated using ((( SELECT is_manager() AS is_manager) OR (scope_type = 'geral'::text) OR (user_id = ( SELECT auth.uid() AS uid))));
create policy "gh_select" on "public"."goal_history" as PERMISSIVE for SELECT to authenticated using ((( SELECT is_manager() AS is_manager) OR (EXISTS ( SELECT 1
   FROM goals g
  WHERE ((g.id = goal_history.goal_id) AND ((g.scope_type = 'geral'::text) OR (g.user_id = ( SELECT auth.uid() AS uid))))))));
create policy "gwe_select" on "public"."goal_week_exceptions" as PERMISSIVE for SELECT to authenticated using ((( SELECT is_manager() AS is_manager) OR (user_id = ( SELECT auth.uid() AS uid))));
create policy "route_plans_select" on "public"."route_plans" as PERMISSIVE for SELECT to authenticated using (((owner_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_manager() AS is_manager)));
create policy "route_plans_insert" on "public"."route_plans" as PERMISSIVE for INSERT to authenticated with check ((owner_id = ( SELECT auth.uid() AS uid)));
create policy "route_plans_update" on "public"."route_plans" as PERMISSIVE for UPDATE to authenticated using ((owner_id = ( SELECT auth.uid() AS uid))) with check ((owner_id = ( SELECT auth.uid() AS uid)));
create policy "route_plans_delete" on "public"."route_plans" as PERMISSIVE for DELETE to authenticated using ((owner_id = ( SELECT auth.uid() AS uid)));
create policy "route_stops_select" on "public"."route_stops" as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM route_plans p
  WHERE ((p.id = route_stops.route_plan_id) AND ((p.owner_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_manager() AS is_manager))))));
create policy "gwe_delete" on "public"."goal_week_exceptions" as PERMISSIVE for DELETE to authenticated using (( SELECT is_manager() AS is_manager));
create policy "school_campaign_engagement_create" on "public"."school_campaign_engagements" as PERMISSIVE for INSERT to authenticated with check ((( SELECT private.school_capture_allowed() AS school_capture_allowed) AND (created_by = ( SELECT auth.uid() AS uid))));
create policy "school_campaign_engagement_update" on "public"."school_campaign_engagements" as PERMISSIVE for UPDATE to authenticated using ((( SELECT private.school_capture_allowed() AS school_capture_allowed) AND ((user_id = ( SELECT auth.uid() AS uid)) OR (created_by = ( SELECT auth.uid() AS uid)) OR ( SELECT private.school_capture_manager() AS school_capture_manager)))) with check ((( SELECT private.school_capture_allowed() AS school_capture_allowed) AND ((user_id = ( SELECT auth.uid() AS uid)) OR (created_by = ( SELECT auth.uid() AS uid)) OR ( SELECT private.school_capture_manager() AS school_capture_manager))));
create policy "goals_update" on "public"."goals" as PERMISSIVE for UPDATE to authenticated using (( SELECT is_manager() AS is_manager)) with check (( SELECT is_manager() AS is_manager));
create policy "goals_delete" on "public"."goals" as PERMISSIVE for DELETE to authenticated using (( SELECT is_manager() AS is_manager));
create policy "gl_insert" on "public"."grade_levels" as PERMISSIVE for INSERT to authenticated with check (( SELECT is_manager() AS is_manager));
create policy "gl_update" on "public"."grade_levels" as PERMISSIVE for UPDATE to authenticated using (( SELECT is_manager() AS is_manager)) with check (( SELECT is_manager() AS is_manager));
create policy "gl_delete" on "public"."grade_levels" as PERMISSIVE for DELETE to authenticated using (( SELECT is_manager() AS is_manager));
create policy "route_stops_insert" on "public"."route_stops" as PERMISSIVE for INSERT to authenticated with check ((EXISTS ( SELECT 1
   FROM route_plans p
  WHERE ((p.id = route_stops.route_plan_id) AND (p.owner_id = ( SELECT auth.uid() AS uid))))));
create policy "route_stops_update" on "public"."route_stops" as PERMISSIVE for UPDATE to authenticated using ((EXISTS ( SELECT 1
   FROM route_plans p
  WHERE ((p.id = route_stops.route_plan_id) AND (p.owner_id = ( SELECT auth.uid() AS uid)))))) with check ((EXISTS ( SELECT 1
   FROM route_plans p
  WHERE ((p.id = route_stops.route_plan_id) AND (p.owner_id = ( SELECT auth.uid() AS uid))))));
create policy "route_stops_delete" on "public"."route_stops" as PERMISSIVE for DELETE to authenticated using ((EXISTS ( SELECT 1
   FROM route_plans p
  WHERE ((p.id = route_stops.route_plan_id) AND (p.owner_id = ( SELECT auth.uid() AS uid))))));
create policy "sagr_insert" on "public"."school_action_grade_results" as PERMISSIVE for INSERT to authenticated with check (( SELECT is_high_school_writer() AS is_high_school_writer));
create policy "sagr_update" on "public"."school_action_grade_results" as PERMISSIVE for UPDATE to authenticated using (( SELECT is_high_school_writer() AS is_high_school_writer)) with check (( SELECT is_high_school_writer() AS is_high_school_writer));
create policy "sap_update" on "public"."school_action_participants" as PERMISSIVE for UPDATE to authenticated using (( SELECT is_high_school_writer() AS is_high_school_writer)) with check (( SELECT is_high_school_writer() AS is_high_school_writer));
create policy "sap_delete" on "public"."school_action_participants" as PERMISSIVE for DELETE to authenticated using (( SELECT is_high_school_writer() AS is_high_school_writer));
create policy "sc_insert" on "public"."school_contacts" as PERMISSIVE for INSERT to authenticated with check (( SELECT is_high_school_writer() AS is_high_school_writer));
create policy "sc_update" on "public"."school_contacts" as PERMISSIVE for UPDATE to authenticated using (( SELECT is_high_school_writer() AS is_high_school_writer)) with check (( SELECT is_high_school_writer() AS is_high_school_writer));
create policy "sc_delete" on "public"."school_contacts" as PERMISSIVE for DELETE to authenticated using (( SELECT is_high_school_writer() AS is_high_school_writer));
create policy "sge_insert" on "public"."school_grade_estimates" as PERMISSIVE for INSERT to authenticated with check (( SELECT is_high_school_writer() AS is_high_school_writer));
create policy "sge_update" on "public"."school_grade_estimates" as PERMISSIVE for UPDATE to authenticated using (( SELECT is_high_school_writer() AS is_high_school_writer)) with check (( SELECT is_high_school_writer() AS is_high_school_writer));
create policy "sge_delete" on "public"."school_grade_estimates" as PERMISSIVE for DELETE to authenticated using (( SELECT is_high_school_writer() AS is_high_school_writer));
create policy "svs_insert" on "public"."supervest_snapshots" as PERMISSIVE for INSERT to authenticated with check (( SELECT is_high_school_writer() AS is_high_school_writer));
create policy "svs_update" on "public"."supervest_snapshots" as PERMISSIVE for UPDATE to authenticated using (( SELECT is_high_school_writer() AS is_high_school_writer)) with check (( SELECT is_high_school_writer() AS is_high_school_writer));
create policy "svs_delete" on "public"."supervest_snapshots" as PERMISSIVE for DELETE to authenticated using (( SELECT is_high_school_writer() AS is_high_school_writer));
create policy "route_user_preferences_select_own" on "public"."route_user_preferences" as PERMISSIVE for SELECT to authenticated using ((user_id = ( SELECT auth.uid() AS uid)));
create policy "route_user_preferences_insert_own" on "public"."route_user_preferences" as PERMISSIVE for INSERT to authenticated with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy "route_user_preferences_update_own" on "public"."route_user_preferences" as PERMISSIVE for UPDATE to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy "route_user_preferences_delete_own" on "public"."route_user_preferences" as PERMISSIVE for DELETE to authenticated using ((user_id = ( SELECT auth.uid() AS uid)));
create policy "attendance_team_slots_read" on "public"."attendance_team_slots" as PERMISSIVE for SELECT to authenticated using (true);
create policy "attendance_rotation_template_read" on "public"."attendance_rotation_template" as PERMISSIVE for SELECT to authenticated using (true);
create policy "attendance_cycles_manage_read" on "public"."attendance_cycles" as PERMISSIVE for SELECT to authenticated using (( SELECT is_manager() AS is_manager));
create policy "attendance_exceptions_read" on "public"."attendance_exceptions" as PERMISSIVE for SELECT to authenticated using (true);
create policy "attendance_absences_read" on "public"."attendance_absences" as PERMISSIVE for SELECT to authenticated using ((( SELECT is_manager() AS is_manager) OR (user_id = ( SELECT auth.uid() AS uid))));
create policy "attendance_occurrences_read" on "public"."attendance_occurrences" as PERMISSIVE for SELECT to authenticated using ((( SELECT is_manager() AS is_manager) OR ((user_id = ( SELECT auth.uid() AS uid)) AND (status = ANY (ARRAY['published'::text, 'cancelled'::text])))));
create policy "attendance_invite_jobs_read" on "public"."attendance_invite_jobs" as PERMISSIVE for SELECT to authenticated using ((( SELECT is_manager() AS is_manager) OR (recipient_user_id = ( SELECT auth.uid() AS uid))));
create policy "attendance_history_read" on "public"."attendance_occurrence_history" as PERMISSIVE for SELECT to authenticated using ((( SELECT is_manager() AS is_manager) OR (EXISTS ( SELECT 1
   FROM attendance_occurrences o
  WHERE ((o.id = attendance_occurrence_history.occurrence_id) AND (o.user_id = ( SELECT auth.uid() AS uid)))))));
create policy "calendar_events_read" on "public"."calendar_events" as PERMISSIVE for SELECT to authenticated using ((( SELECT is_manager() AS is_manager) OR (recipient_user_id = ( SELECT auth.uid() AS uid))));
create policy "calendar_invite_jobs_read" on "public"."calendar_invite_jobs" as PERMISSIVE for SELECT to authenticated using ((( SELECT is_manager() AS is_manager) OR (EXISTS ( SELECT 1
   FROM calendar_events e
  WHERE ((e.id = calendar_invite_jobs.calendar_event_id) AND (e.recipient_user_id = ( SELECT auth.uid() AS uid)))))));
create policy "attendance_members_manager_insert" on "public"."attendance_members" as PERMISSIVE for INSERT to authenticated with check (( SELECT is_manager() AS is_manager));
create policy "attendance_absences_manager_insert" on "public"."attendance_absences" as PERMISSIVE for INSERT to authenticated with check (( SELECT is_manager() AS is_manager));
create policy "attendance_absences_manager_update" on "public"."attendance_absences" as PERMISSIVE for UPDATE to authenticated using (( SELECT is_manager() AS is_manager)) with check (( SELECT is_manager() AS is_manager));
create policy "attendance_absences_manager_delete" on "public"."attendance_absences" as PERMISSIVE for DELETE to authenticated using (( SELECT is_manager() AS is_manager));
create policy "attendance_exceptions_manager_insert" on "public"."attendance_exceptions" as PERMISSIVE for INSERT to authenticated with check (( SELECT is_manager() AS is_manager));
create policy "attendance_exceptions_manager_update" on "public"."attendance_exceptions" as PERMISSIVE for UPDATE to authenticated using (( SELECT is_manager() AS is_manager)) with check (( SELECT is_manager() AS is_manager));
create policy "attendance_exceptions_manager_delete" on "public"."attendance_exceptions" as PERMISSIVE for DELETE to authenticated using (( SELECT is_manager() AS is_manager));
create policy "attendance_invite_jobs_manager_insert" on "public"."attendance_invite_jobs" as PERMISSIVE for INSERT to authenticated with check (( SELECT is_manager() AS is_manager));
create policy "attendance_invite_jobs_manager_update" on "public"."attendance_invite_jobs" as PERMISSIVE for UPDATE to authenticated using (( SELECT is_manager() AS is_manager)) with check (( SELECT is_manager() AS is_manager));
create policy "attendance_invite_jobs_manager_delete" on "public"."attendance_invite_jobs" as PERMISSIVE for DELETE to authenticated using (( SELECT is_manager() AS is_manager));
create policy "attendance_members_manager_update" on "public"."attendance_members" as PERMISSIVE for UPDATE to authenticated using (( SELECT is_manager() AS is_manager)) with check (( SELECT is_manager() AS is_manager));
create policy "attendance_members_manager_delete" on "public"."attendance_members" as PERMISSIVE for DELETE to authenticated using (( SELECT is_manager() AS is_manager));
create policy "attendance_occurrences_manager_insert" on "public"."attendance_occurrences" as PERMISSIVE for INSERT to authenticated with check (( SELECT is_manager() AS is_manager));
create policy "attendance_occurrences_manager_update" on "public"."attendance_occurrences" as PERMISSIVE for UPDATE to authenticated using (( SELECT is_manager() AS is_manager)) with check (( SELECT is_manager() AS is_manager));
create policy "attendance_occurrences_manager_delete" on "public"."attendance_occurrences" as PERMISSIVE for DELETE to authenticated using (( SELECT is_manager() AS is_manager));
create policy "attendance_rotation_template_manager_update" on "public"."attendance_rotation_template" as PERMISSIVE for UPDATE to authenticated using (( SELECT is_manager() AS is_manager)) with check (( SELECT is_manager() AS is_manager));
create policy "attendance_rotation_template_manager_delete" on "public"."attendance_rotation_template" as PERMISSIVE for DELETE to authenticated using (( SELECT is_manager() AS is_manager));
create policy "attendance_settings_manager_insert" on "public"."attendance_settings" as PERMISSIVE for INSERT to authenticated with check (( SELECT is_manager() AS is_manager));
create policy "attendance_settings_manager_update" on "public"."attendance_settings" as PERMISSIVE for UPDATE to authenticated using (( SELECT is_manager() AS is_manager)) with check (( SELECT is_manager() AS is_manager));
create policy "attendance_settings_manager_delete" on "public"."attendance_settings" as PERMISSIVE for DELETE to authenticated using (( SELECT is_manager() AS is_manager));
create policy "attendance_team_slots_manager_insert" on "public"."attendance_team_slots" as PERMISSIVE for INSERT to authenticated with check (( SELECT is_manager() AS is_manager));
create policy "attendance_team_slots_manager_update" on "public"."attendance_team_slots" as PERMISSIVE for UPDATE to authenticated using (( SELECT is_manager() AS is_manager)) with check (( SELECT is_manager() AS is_manager));
create policy "attendance_team_slots_manager_delete" on "public"."attendance_team_slots" as PERMISSIVE for DELETE to authenticated using (( SELECT is_manager() AS is_manager));
create policy "calendar_events_manager_insert" on "public"."calendar_events" as PERMISSIVE for INSERT to authenticated with check (( SELECT is_manager() AS is_manager));
create policy "calendar_events_manager_update" on "public"."calendar_events" as PERMISSIVE for UPDATE to authenticated using (( SELECT is_manager() AS is_manager)) with check (( SELECT is_manager() AS is_manager));
create policy "calendar_events_manager_delete" on "public"."calendar_events" as PERMISSIVE for DELETE to authenticated using (( SELECT is_manager() AS is_manager));
create policy "calendar_invite_jobs_manager_insert" on "public"."calendar_invite_jobs" as PERMISSIVE for INSERT to authenticated with check (( SELECT is_manager() AS is_manager));
create policy "calendar_invite_jobs_manager_update" on "public"."calendar_invite_jobs" as PERMISSIVE for UPDATE to authenticated using (( SELECT is_manager() AS is_manager)) with check (( SELECT is_manager() AS is_manager));
create policy "calendar_invite_jobs_manager_delete" on "public"."calendar_invite_jobs" as PERMISSIVE for DELETE to authenticated using (( SELECT is_manager() AS is_manager));
create policy "attendance_cycles_manager_insert" on "public"."attendance_cycles" as PERMISSIVE for INSERT to authenticated with check (( SELECT is_manager() AS is_manager));
create policy "attendance_cycles_manager_update" on "public"."attendance_cycles" as PERMISSIVE for UPDATE to authenticated using (( SELECT is_manager() AS is_manager)) with check (( SELECT is_manager() AS is_manager));
create policy "attendance_cycles_manager_delete" on "public"."attendance_cycles" as PERMISSIVE for DELETE to authenticated using (( SELECT is_manager() AS is_manager));
create policy "activity_participants_read" on "public"."activity_participants" as PERMISSIVE for SELECT to authenticated using (((EXISTS ( SELECT 1
   FROM activities a
  WHERE (a.id = activity_participants.activity_id))) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND p.active)))));
create policy "activities_meeting_insert_backend" on "public"."activities" as RESTRICTIVE for INSERT to authenticated with check (((meeting_type IS NULL) AND (organizer_user_id IS NULL) AND (outlook_event_id IS NULL) AND (sync_status IS NULL)));
create policy "activities_meeting_update_backend" on "public"."activities" as RESTRICTIVE for UPDATE to authenticated using ((meeting_type IS NULL)) with check (((meeting_type IS NULL) AND (organizer_user_id IS NULL) AND (outlook_event_id IS NULL) AND (sync_status IS NULL)));
create policy "activities_meeting_delete_backend" on "public"."activities" as RESTRICTIVE for DELETE to authenticated using ((meeting_type IS NULL));
create policy "company_actions_read" on "public"."company_actions" as PERMISSIVE for SELECT to authenticated using (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND p.active))) AND (EXISTS ( SELECT 1
   FROM companies c
  WHERE (c.id = company_actions.company_id)))));
create policy "company_actions_insert" on "public"."company_actions" as PERMISSIVE for INSERT to authenticated with check (((created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM profiles actor
  WHERE ((actor.id = ( SELECT auth.uid() AS uid)) AND actor.active AND (actor.role = ANY (ARRAY['gerente'::text, 'supervisor'::text, 'consultor_b2b'::text, 'consultor'::text])) AND (EXISTS ( SELECT 1
           FROM companies c
          WHERE ((c.id = company_actions.company_id) AND ((actor.role = ANY (ARRAY['gerente'::text, 'supervisor'::text])) OR (c.owner_id = actor.id))))) AND ((actor.role = ANY (ARRAY['gerente'::text, 'supervisor'::text])) OR (company_actions.responsible_user_id = actor.id))))) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = company_actions.responsible_user_id) AND p.active AND (p.role = ANY (ARRAY['gerente'::text, 'supervisor'::text, 'consultor_b2b'::text, 'consultor'::text])))))));
create policy "school_campaign_read" on "public"."school_campaigns" as PERMISSIVE for SELECT to authenticated using (( SELECT private.school_capture_allowed() AS school_capture_allowed));
create policy "school_campaign_create" on "public"."school_campaigns" as PERMISSIVE for INSERT to authenticated with check ((( SELECT private.school_capture_allowed() AS school_capture_allowed) AND (created_by = ( SELECT auth.uid() AS uid))));
create policy "school_campaign_contacts_read" on "public"."school_campaign_contacts" as PERMISSIVE for SELECT to authenticated using (( SELECT private.school_capture_allowed() AS school_capture_allowed));
create policy "school_campaign_contacts_create" on "public"."school_campaign_contacts" as PERMISSIVE for INSERT to authenticated with check ((( SELECT private.school_capture_allowed() AS school_capture_allowed) AND (consultant_id = ( SELECT auth.uid() AS uid)) AND (created_by = ( SELECT auth.uid() AS uid))));
create policy "school_campaign_engagement_read" on "public"."school_campaign_engagements" as PERMISSIVE for SELECT to authenticated using (( SELECT private.school_capture_allowed() AS school_capture_allowed));
create policy "school_campaign_history_read" on "public"."school_campaign_history" as PERMISSIVE for SELECT to authenticated using (( SELECT private.school_capture_allowed() AS school_capture_allowed));
create policy "school_capture_action_insert" on "public"."school_actions" as PERMISSIVE for INSERT to authenticated with check ((( SELECT private.school_capture_allowed() AS school_capture_allowed) AND (supervest_cycle_id IS NOT NULL) AND (created_by = ( SELECT auth.uid() AS uid))));
create policy "school_capture_action_update" on "public"."school_actions" as PERMISSIVE for UPDATE to authenticated using ((( SELECT private.school_capture_allowed() AS school_capture_allowed) AND (supervest_cycle_id IS NOT NULL) AND ((created_by = ( SELECT auth.uid() AS uid)) OR (primary_owner_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.school_capture_manager() AS school_capture_manager) OR (EXISTS ( SELECT 1
   FROM school_action_participants p
  WHERE ((p.school_action_id = school_actions.id) AND (p.user_id = ( SELECT auth.uid() AS uid)))))))) with check ((( SELECT private.school_capture_allowed() AS school_capture_allowed) AND (supervest_cycle_id IS NOT NULL) AND ((created_by = ( SELECT auth.uid() AS uid)) OR (primary_owner_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.school_capture_manager() AS school_capture_manager) OR (EXISTS ( SELECT 1
   FROM school_action_participants p
  WHERE ((p.school_action_id = school_actions.id) AND (p.user_id = ( SELECT auth.uid() AS uid))))))));
create policy "school_capture_participant_insert" on "public"."school_action_participants" as PERMISSIVE for INSERT to authenticated with check (private.school_capture_action_editor(school_action_id));
create policy "school_capture_participant_delete" on "public"."school_action_participants" as PERMISSIVE for DELETE to authenticated using (private.school_capture_action_editor(school_action_id));
create policy "school_capture_result_insert" on "public"."school_action_grade_results" as PERMISSIVE for INSERT to authenticated with check (private.school_capture_action_editor(school_action_id));
create policy "school_capture_result_update" on "public"."school_action_grade_results" as PERMISSIVE for UPDATE to authenticated using (private.school_capture_action_editor(school_action_id)) with check (private.school_capture_action_editor(school_action_id));
create policy "b2b_history_read" on "public"."company_portfolio_history" as PERMISSIVE for SELECT to authenticated using ((private.b2b_manager() OR (EXISTS ( SELECT 1
   FROM companies c
  WHERE (c.id = company_portfolio_history.company_id)))));
create policy "b2b_requests_read" on "public"."company_assignment_requests" as PERMISSIVE for SELECT to authenticated using ((private.b2b_manager() OR (requested_by = ( SELECT auth.uid() AS uid))));
create policy "b2b_notifications_read" on "public"."company_portfolio_notifications" as PERMISSIVE for SELECT to authenticated using (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND profiles.active)))));
create policy "companies_update" on "public"."companies" as PERMISSIVE for UPDATE to authenticated using ((( SELECT is_manager() AS is_manager) OR (owner_id = ( SELECT auth.uid() AS uid)))) with check ((( SELECT is_manager() AS is_manager) OR (owner_id = ( SELECT auth.uid() AS uid))));
create policy "b2b_companies_active_actor" on "public"."companies" as RESTRICTIVE for ALL to authenticated using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND profiles.active)))) with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND profiles.active))));
create policy "user_access_history_manager" on "public"."user_access_history" as PERMISSIVE for SELECT to authenticated using ((( SELECT private.password_access_allowed() AS password_access_allowed) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'gerente'::text) AND p.active)))));
create policy "password_rotation_gate" on "public"."agreements" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."attachments" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."company_contacts" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."app_settings" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."school_stage_history" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."school_owner_history" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."commercial_cycles" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."supervest_snapshots" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."school_contacts" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."grade_levels" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."school_grade_estimates" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."route_stops" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."goal_types" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."goals" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."goal_history" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."goal_week_exceptions" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."weekly_action_snapshots" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."route_user_preferences" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."route_plans" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."attendance_team_slots" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."attendance_rotation_template" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."attendance_cycles" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."attendance_exceptions" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."attendance_absences" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."attendance_occurrences" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."attendance_invite_jobs" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."attendance_occurrence_history" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."attendance_settings" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."attendance_members" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."calendar_events" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."calendar_invite_jobs" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."companies" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."activity_participants" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."microsoft_calendar_accounts" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."schools" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."activities" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."company_actions" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."supervest_cycles" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."school_actions" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."school_action_participants" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."school_action_grade_results" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."school_campaigns" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."school_campaign_contacts" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."school_campaign_engagements" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."school_campaign_history" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."company_portfolio_history" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."company_assignment_requests" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."company_portfolio_notifications" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_gate" on "public"."user_access_history" as RESTRICTIVE for ALL to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_profile_read" on "public"."profiles" as RESTRICTIVE for SELECT to authenticated using (((id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.password_access_allowed() AS password_access_allowed)));
create policy "password_rotation_profile_insert" on "public"."profiles" as RESTRICTIVE for INSERT to authenticated with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_profile_update" on "public"."profiles" as RESTRICTIVE for UPDATE to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed)) with check (( SELECT private.password_access_allowed() AS password_access_allowed));
create policy "password_rotation_profile_delete" on "public"."profiles" as RESTRICTIVE for DELETE to authenticated using (( SELECT private.password_access_allowed() AS password_access_allowed));
CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON company_contacts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON activities FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON agreements FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON app_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
CREATE TRIGGER guard_profile_update BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION guard_profile_update();
CREATE TRIGGER trg_schools_touch BEFORE UPDATE ON schools FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_school_stage_hist AFTER INSERT OR UPDATE ON schools FOR EACH ROW EXECUTE FUNCTION log_school_stage_change();
CREATE TRIGGER trg_school_owner_hist AFTER INSERT OR UPDATE ON schools FOR EACH ROW EXECUTE FUNCTION log_school_owner_change();
CREATE TRIGGER trg_school_contacts_touch BEFORE UPDATE ON school_contacts FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_estimates_touch BEFORE UPDATE ON school_grade_estimates FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_school_actions_touch BEFORE UPDATE ON school_actions FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_grade_results_touch BEFORE UPDATE ON school_action_grade_results FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_enforce_supervest BEFORE INSERT OR UPDATE ON school_action_grade_results FOR EACH ROW EXECUTE FUNCTION enforce_supervest_eligibility();
CREATE TRIGGER trg_commercial_cycles_touch BEFORE UPDATE ON commercial_cycles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_supervest_cycles_touch BEFORE UPDATE ON supervest_cycles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_goals_touch BEFORE UPDATE ON goals FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_goals_history AFTER INSERT OR UPDATE ON goals FOR EACH ROW EXECUTE FUNCTION log_goal_change();
CREATE TRIGGER trg_route_plans_touch BEFORE UPDATE ON route_plans FOR EACH ROW EXECUTE FUNCTION touch_route_plan_updated_at();
CREATE TRIGGER attendance_settings_touch BEFORE UPDATE ON attendance_settings FOR EACH ROW EXECUTE FUNCTION attendance_touch_updated_at();
CREATE TRIGGER attendance_team_slots_touch BEFORE UPDATE ON attendance_team_slots FOR EACH ROW EXECUTE FUNCTION attendance_touch_updated_at();
CREATE TRIGGER attendance_rotation_template_touch BEFORE UPDATE ON attendance_rotation_template FOR EACH ROW EXECUTE FUNCTION attendance_touch_updated_at();
CREATE TRIGGER attendance_cycles_touch BEFORE UPDATE ON attendance_cycles FOR EACH ROW EXECUTE FUNCTION attendance_touch_updated_at();
CREATE TRIGGER attendance_exceptions_touch BEFORE UPDATE ON attendance_exceptions FOR EACH ROW EXECUTE FUNCTION attendance_touch_updated_at();
CREATE TRIGGER attendance_absences_touch BEFORE UPDATE ON attendance_absences FOR EACH ROW EXECUTE FUNCTION attendance_touch_updated_at();
CREATE TRIGGER attendance_occurrences_touch BEFORE UPDATE ON attendance_occurrences FOR EACH ROW EXECUTE FUNCTION attendance_touch_updated_at();
CREATE TRIGGER attendance_invite_jobs_touch BEFORE UPDATE ON attendance_invite_jobs FOR EACH ROW EXECUTE FUNCTION attendance_touch_updated_at();
CREATE TRIGGER attendance_occurrences_history AFTER INSERT OR DELETE OR UPDATE ON attendance_occurrences FOR EACH ROW EXECUTE FUNCTION attendance_log_occurrence_change();
CREATE TRIGGER attendance_members_touch BEFORE UPDATE ON attendance_members FOR EACH ROW EXECUTE FUNCTION attendance_touch_updated_at();
CREATE TRIGGER calendar_events_touch BEFORE UPDATE ON calendar_events FOR EACH ROW EXECUTE FUNCTION attendance_touch_updated_at();
CREATE TRIGGER calendar_invite_jobs_touch BEFORE UPDATE ON calendar_invite_jobs FOR EACH ROW EXECUTE FUNCTION attendance_touch_updated_at();
CREATE TRIGGER trg_sync_company_next_action_calendar AFTER INSERT OR UPDATE OF proxima_acao, data_proxima_acao, next_action_start_time, next_action_end_time, next_action_location, next_action_owner_id, nome_fantasia, razao_social ON companies FOR EACH ROW EXECUTE FUNCTION sync_company_next_action_calendar_trigger();
CREATE TRIGGER b2b_keep_meeting_history BEFORE DELETE ON activities FOR EACH ROW EXECUTE FUNCTION b2b_keep_meeting_history();
CREATE TRIGGER company_actions_stamp BEFORE INSERT ON company_actions FOR EACH ROW EXECUTE FUNCTION stamp_company_action();
CREATE TRIGGER stamp_school_campaign BEFORE INSERT ON school_campaigns FOR EACH ROW EXECUTE FUNCTION private.stamp_school_capture_record();
CREATE TRIGGER stamp_school_campaign_contact BEFORE INSERT ON school_campaign_contacts FOR EACH ROW EXECUTE FUNCTION private.stamp_school_capture_record();
CREATE TRIGGER stamp_school_campaign_engagement BEFORE INSERT OR UPDATE ON school_campaign_engagements FOR EACH ROW EXECUTE FUNCTION private.stamp_school_capture_record();
CREATE TRIGGER guard_school_capture_action BEFORE INSERT OR DELETE OR UPDATE ON school_actions FOR EACH ROW EXECUTE FUNCTION private.guard_school_capture_action();
CREATE TRIGGER stamp_school_capture_participant BEFORE INSERT OR UPDATE ON school_action_participants FOR EACH ROW EXECUTE FUNCTION private.stamp_school_capture_participant();
CREATE TRIGGER guard_school_capture_result BEFORE INSERT OR DELETE OR UPDATE ON school_action_grade_results FOR EACH ROW EXECUTE FUNCTION private.guard_school_capture_result();
CREATE TRIGGER audit_school_offered_grades AFTER UPDATE OF offered_grades ON schools FOR EACH ROW WHEN (old.offered_grades IS DISTINCT FROM new.offered_grades) EXECUTE FUNCTION private.audit_school_capture();
CREATE TRIGGER audit_school_campaign_contact AFTER INSERT ON school_campaign_contacts FOR EACH ROW EXECUTE FUNCTION private.audit_school_capture();
CREATE TRIGGER audit_school_campaign_engagement AFTER INSERT OR UPDATE ON school_campaign_engagements FOR EACH ROW EXECUTE FUNCTION private.audit_school_capture();
CREATE TRIGGER audit_school_capture_action AFTER INSERT OR DELETE OR UPDATE ON school_actions FOR EACH ROW EXECUTE FUNCTION private.audit_school_capture();
CREATE TRIGGER audit_school_capture_participant AFTER INSERT OR DELETE OR UPDATE ON school_action_participants FOR EACH ROW EXECUTE FUNCTION private.audit_school_capture();
CREATE TRIGGER audit_school_capture_result AFTER INSERT OR DELETE OR UPDATE ON school_action_grade_results FOR EACH ROW EXECUTE FUNCTION private.audit_school_capture();
CREATE CONSTRAINT TRIGGER trg_sync_school_action_calendar AFTER INSERT OR DELETE OR UPDATE ON school_actions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.sync_school_action_agenda_trigger();
CREATE CONSTRAINT TRIGGER trg_sync_school_action_participant_calendar AFTER INSERT OR DELETE OR UPDATE ON school_action_participants DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.sync_school_action_agenda_trigger();
CREATE TRIGGER b2b_guard_company BEFORE INSERT OR UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION private.b2b_guard_company();
CREATE TRIGGER b2b_company_history AFTER INSERT OR UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION private.b2b_company_history();
CREATE TRIGGER b2b_stamp_activity BEFORE INSERT ON activities FOR EACH ROW EXECUTE FUNCTION private.b2b_stamp_activity();
CREATE TRIGGER b2b_activity_relationship AFTER INSERT OR UPDATE OF status, data, tipo ON activities FOR EACH ROW EXECUTE FUNCTION private.b2b_activity_relationship();
CREATE TRIGGER b2b_action_relationship AFTER INSERT ON company_actions FOR EACH ROW EXECUTE FUNCTION private.b2b_activity_relationship();
CREATE TRIGGER b2b_guard_departure BEFORE UPDATE OF active, role ON profiles FOR EACH ROW EXECUTE FUNCTION private.b2b_guard_departure();
CREATE TRIGGER b2b_guard_settings BEFORE UPDATE ON app_settings FOR EACH ROW EXECUTE FUNCTION private.b2b_guard_settings();
CREATE TRIGGER b2b_guard_cycle BEFORE INSERT OR UPDATE ON commercial_cycles FOR EACH ROW EXECUTE FUNCTION private.b2b_guard_cycle();
CREATE TRIGGER b2b_guard_profile_privileges BEFORE INSERT OR UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION private.b2b_guard_profile_privileges();
CREATE TRIGGER guard_password_state BEFORE INSERT OR UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION private.guard_password_state();
CREATE TRIGGER uniconecta_password_changed AFTER UPDATE OF encrypted_password ON auth.users FOR EACH ROW EXECUTE FUNCTION private.on_auth_password_changed();
grant usage on schema public,private to anon,authenticated,service_role;
alter table "public"."profiles" enable row level security;
revoke all on table "public"."profiles" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."profiles" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."profiles" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."profiles" to service_role;
alter table "public"."agreements" enable row level security;
revoke all on table "public"."agreements" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."agreements" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."agreements" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."agreements" to service_role;
alter table "public"."attachments" enable row level security;
revoke all on table "public"."attachments" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attachments" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attachments" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attachments" to service_role;
alter table "public"."company_contacts" enable row level security;
revoke all on table "public"."company_contacts" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."company_contacts" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."company_contacts" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."company_contacts" to service_role;
alter table "public"."app_settings" enable row level security;
revoke all on table "public"."app_settings" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."app_settings" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."app_settings" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."app_settings" to service_role;
alter table "public"."school_stage_history" enable row level security;
revoke all on table "public"."school_stage_history" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."school_stage_history" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."school_stage_history" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."school_stage_history" to service_role;
alter table "public"."school_owner_history" enable row level security;
revoke all on table "public"."school_owner_history" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."school_owner_history" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."school_owner_history" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."school_owner_history" to service_role;
alter table "public"."commercial_cycles" enable row level security;
revoke all on table "public"."commercial_cycles" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."commercial_cycles" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."commercial_cycles" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."commercial_cycles" to service_role;
alter table "public"."supervest_snapshots" enable row level security;
revoke all on table "public"."supervest_snapshots" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."supervest_snapshots" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."supervest_snapshots" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."supervest_snapshots" to service_role;
alter table "public"."school_contacts" enable row level security;
revoke all on table "public"."school_contacts" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."school_contacts" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."school_contacts" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."school_contacts" to service_role;
alter table "public"."grade_levels" enable row level security;
revoke all on table "public"."grade_levels" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."grade_levels" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."grade_levels" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."grade_levels" to service_role;
alter table "public"."school_grade_estimates" enable row level security;
revoke all on table "public"."school_grade_estimates" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."school_grade_estimates" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."school_grade_estimates" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."school_grade_estimates" to service_role;
alter table "public"."route_stops" enable row level security;
revoke all on table "public"."route_stops" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."route_stops" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."route_stops" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."route_stops" to service_role;
alter table "public"."goal_types" enable row level security;
revoke all on table "public"."goal_types" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."goal_types" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."goal_types" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."goal_types" to service_role;
alter table "public"."goals" enable row level security;
revoke all on table "public"."goals" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."goals" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."goals" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."goals" to service_role;
alter table "public"."goal_history" enable row level security;
revoke all on table "public"."goal_history" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."goal_history" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."goal_history" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."goal_history" to service_role;
alter table "public"."goal_week_exceptions" enable row level security;
revoke all on table "public"."goal_week_exceptions" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."goal_week_exceptions" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."goal_week_exceptions" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."goal_week_exceptions" to service_role;
alter table "public"."weekly_action_snapshots" enable row level security;
revoke all on table "public"."weekly_action_snapshots" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."weekly_action_snapshots" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."weekly_action_snapshots" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."weekly_action_snapshots" to service_role;
alter table "public"."route_user_preferences" enable row level security;
revoke all on table "public"."route_user_preferences" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."route_user_preferences" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."route_user_preferences" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."route_user_preferences" to service_role;
alter table "public"."route_plans" enable row level security;
revoke all on table "public"."route_plans" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."route_plans" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."route_plans" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."route_plans" to service_role;
alter table "public"."attendance_team_slots" enable row level security;
revoke all on table "public"."attendance_team_slots" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attendance_team_slots" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attendance_team_slots" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attendance_team_slots" to service_role;
alter table "public"."attendance_rotation_template" enable row level security;
revoke all on table "public"."attendance_rotation_template" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attendance_rotation_template" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attendance_rotation_template" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attendance_rotation_template" to service_role;
alter table "public"."attendance_cycles" enable row level security;
revoke all on table "public"."attendance_cycles" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attendance_cycles" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attendance_cycles" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attendance_cycles" to service_role;
alter table "public"."attendance_exceptions" enable row level security;
revoke all on table "public"."attendance_exceptions" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attendance_exceptions" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attendance_exceptions" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attendance_exceptions" to service_role;
alter table "public"."attendance_absences" enable row level security;
revoke all on table "public"."attendance_absences" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attendance_absences" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attendance_absences" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attendance_absences" to service_role;
alter table "public"."attendance_occurrences" enable row level security;
revoke all on table "public"."attendance_occurrences" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attendance_occurrences" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attendance_occurrences" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attendance_occurrences" to service_role;
alter table "public"."attendance_invite_jobs" enable row level security;
revoke all on table "public"."attendance_invite_jobs" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attendance_invite_jobs" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attendance_invite_jobs" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attendance_invite_jobs" to service_role;
alter table "public"."attendance_occurrence_history" enable row level security;
revoke all on table "public"."attendance_occurrence_history" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attendance_occurrence_history" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attendance_occurrence_history" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attendance_occurrence_history" to service_role;
alter table "public"."attendance_settings" enable row level security;
revoke all on table "public"."attendance_settings" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attendance_settings" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attendance_settings" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attendance_settings" to service_role;
alter table "public"."attendance_members" enable row level security;
revoke all on table "public"."attendance_members" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attendance_members" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attendance_members" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."attendance_members" to service_role;
alter table "public"."calendar_events" enable row level security;
revoke all on table "public"."calendar_events" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."calendar_events" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."calendar_events" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."calendar_events" to service_role;
alter table "public"."calendar_invite_jobs" enable row level security;
revoke all on table "public"."calendar_invite_jobs" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."calendar_invite_jobs" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."calendar_invite_jobs" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."calendar_invite_jobs" to service_role;
alter table "public"."companies" enable row level security;
revoke all on table "public"."companies" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."companies" to anon;
grant insert,select,delete,truncate,references,trigger on table "public"."companies" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."companies" to service_role;
alter table "public"."activity_participants" enable row level security;
revoke all on table "public"."activity_participants" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."activity_participants" to service_role;
grant select on table "public"."activity_participants" to authenticated;
alter table "public"."microsoft_calendar_accounts" enable row level security;
revoke all on table "public"."microsoft_calendar_accounts" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."microsoft_calendar_accounts" to service_role;
alter table "public"."schools" enable row level security;
revoke all on table "public"."schools" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."schools" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."schools" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."schools" to service_role;
alter table "public"."activities" enable row level security;
revoke all on table "public"."activities" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."activities" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."activities" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."activities" to service_role;
alter table "public"."company_actions" enable row level security;
revoke all on table "public"."company_actions" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."company_actions" to service_role;
grant insert,select on table "public"."company_actions" to authenticated;
alter table "public"."supervest_cycles" enable row level security;
revoke all on table "public"."supervest_cycles" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."supervest_cycles" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."supervest_cycles" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."supervest_cycles" to service_role;
alter table "public"."school_actions" enable row level security;
revoke all on table "public"."school_actions" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."school_actions" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."school_actions" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."school_actions" to service_role;
alter table "public"."school_action_participants" enable row level security;
revoke all on table "public"."school_action_participants" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."school_action_participants" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."school_action_participants" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."school_action_participants" to service_role;
alter table "public"."school_action_grade_results" enable row level security;
revoke all on table "public"."school_action_grade_results" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."school_action_grade_results" to anon;
grant insert,select,update,delete,truncate,references,trigger on table "public"."school_action_grade_results" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."school_action_grade_results" to service_role;
alter table "public"."school_campaigns" enable row level security;
revoke all on table "public"."school_campaigns" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."school_campaigns" to service_role;
grant insert,select on table "public"."school_campaigns" to authenticated;
alter table "public"."school_campaign_contacts" enable row level security;
revoke all on table "public"."school_campaign_contacts" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."school_campaign_contacts" to service_role;
grant insert,select on table "public"."school_campaign_contacts" to authenticated;
alter table "public"."school_campaign_engagements" enable row level security;
revoke all on table "public"."school_campaign_engagements" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."school_campaign_engagements" to service_role;
grant insert,select,update on table "public"."school_campaign_engagements" to authenticated;
alter table "public"."school_campaign_history" enable row level security;
revoke all on table "public"."school_campaign_history" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."school_campaign_history" to service_role;
grant select on table "public"."school_campaign_history" to authenticated;
alter table "public"."company_portfolio_history" enable row level security;
revoke all on table "public"."company_portfolio_history" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."company_portfolio_history" to service_role;
grant select on table "public"."company_portfolio_history" to authenticated;
alter table "public"."company_assignment_requests" enable row level security;
revoke all on table "public"."company_assignment_requests" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."company_assignment_requests" to service_role;
grant select on table "public"."company_assignment_requests" to authenticated;
alter table "public"."company_portfolio_notifications" enable row level security;
revoke all on table "public"."company_portfolio_notifications" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."company_portfolio_notifications" to service_role;
grant select on table "public"."company_portfolio_notifications" to authenticated;
revoke all on table "public"."b2b_company_portfolio" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."b2b_company_portfolio" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."b2b_company_portfolio" to service_role;
revoke all on table "public"."b2b_activities_with_cycle" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."b2b_activities_with_cycle" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."b2b_activities_with_cycle" to service_role;
revoke all on table "public"."b2b_actions_with_cycle" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."b2b_actions_with_cycle" to authenticated;
grant insert,select,update,delete,truncate,references,trigger on table "public"."b2b_actions_with_cycle" to service_role;
alter table "public"."user_access_history" enable row level security;
revoke all on table "public"."user_access_history" from public,anon,authenticated,service_role;
grant insert,select,update,delete,truncate,references,trigger on table "public"."user_access_history" to service_role;
grant select on table "public"."user_access_history" to authenticated;
grant update ("id") on table "public"."companies" to authenticated;
grant update ("razao_social") on table "public"."companies" to authenticated;
grant update ("nome_fantasia") on table "public"."companies" to authenticated;
grant update ("cnpj") on table "public"."companies" to authenticated;
grant update ("segmento") on table "public"."companies" to authenticated;
grant update ("colaboradores") on table "public"."companies" to authenticated;
grant update ("cidade") on table "public"."companies" to authenticated;
grant update ("bairro") on table "public"."companies" to authenticated;
grant update ("telefone") on table "public"."companies" to authenticated;
grant update ("site") on table "public"."companies" to authenticated;
grant update ("origem") on table "public"."companies" to authenticated;
grant update ("classificacao") on table "public"."companies" to authenticated;
grant update ("etapa") on table "public"."companies" to authenticated;
grant update ("potencial") on table "public"."companies" to authenticated;
grant update ("possui_beneficio") on table "public"."companies" to authenticated;
grant update ("observacoes") on table "public"."companies" to authenticated;
grant update ("consultor") on table "public"."companies" to authenticated;
grant update ("owner_id") on table "public"."companies" to authenticated;
grant update ("ultimo_contato") on table "public"."companies" to authenticated;
grant update ("proxima_acao") on table "public"."companies" to authenticated;
grant update ("data_proxima_acao") on table "public"."companies" to authenticated;
grant update ("data_entrada") on table "public"."companies" to authenticated;
grant update ("link_inscricao") on table "public"."companies" to authenticated;
grant update ("link_consultor") on table "public"."companies" to authenticated;
grant update ("created_at") on table "public"."companies" to authenticated;
grant update ("updated_at") on table "public"."companies" to authenticated;
grant update ("logradouro") on table "public"."companies" to authenticated;
grant update ("numero") on table "public"."companies" to authenticated;
grant update ("complemento") on table "public"."companies" to authenticated;
grant update ("cep") on table "public"."companies" to authenticated;
grant update ("latitude") on table "public"."companies" to authenticated;
grant update ("longitude") on table "public"."companies" to authenticated;
grant update ("geocoded_at") on table "public"."companies" to authenticated;
grant update ("geocode_precision") on table "public"."companies" to authenticated;
grant update ("geocode_hash") on table "public"."companies" to authenticated;
grant update ("next_action_start_time") on table "public"."companies" to authenticated;
grant update ("next_action_end_time") on table "public"."companies" to authenticated;
grant update ("next_action_location") on table "public"."companies" to authenticated;
grant update ("next_action_owner_id") on table "public"."companies" to authenticated;
revoke all on function private.sync_school_action_calendar(uuid) from public,anon,authenticated,service_role;
revoke all on function log_school_owner_change() from public,anon,authenticated,service_role;
grant execute on function log_school_owner_change() to service_role;
revoke all on function touch_updated_at() from public,anon,authenticated,service_role;
grant execute on function touch_updated_at() to service_role;
revoke all on function handle_new_user() from public,anon,authenticated,service_role;
grant execute on function handle_new_user() to service_role;
revoke all on function is_high_school_writer() from public,anon,authenticated,service_role;
grant execute on function is_high_school_writer() to authenticated;
grant execute on function is_high_school_writer() to service_role;
revoke all on function b2b_keep_meeting_history() from public,anon,authenticated,service_role;
grant execute on function b2b_keep_meeting_history() to service_role;
revoke all on function guard_profile_update() from public,anon,authenticated,service_role;
grant execute on function guard_profile_update() to service_role;
revoke all on function private.school_capture_action_editor(uuid) from public,anon,authenticated,service_role;
grant execute on function private.school_capture_action_editor(uuid) to authenticated;
revoke all on function enforce_supervest_eligibility() from public,anon,authenticated,service_role;
grant execute on function enforce_supervest_eligibility() to service_role;
revoke all on function private.stamp_school_capture_record() from public,anon,authenticated,service_role;
grant execute on function private.stamp_school_capture_record() to authenticated;
revoke all on function log_school_stage_change() from public,anon,authenticated,service_role;
grant execute on function log_school_stage_change() to service_role;
revoke all on function set_updated_at() from public,anon,authenticated,service_role;
grant execute on function set_updated_at() to service_role;
revoke all on function is_manager() from public,anon,authenticated,service_role;
grant execute on function is_manager() to authenticated;
grant execute on function is_manager() to service_role;
revoke all on function update_goal(uuid,numeric,text,date,date,text,text) from public,anon,authenticated,service_role;
grant execute on function update_goal(uuid,numeric,text,date,date,text,text) to authenticated;
grant execute on function update_goal(uuid,numeric,text,date,date,text,text) to service_role;
revoke all on function log_goal_change() from public,anon,authenticated,service_role;
grant execute on function log_goal_change() to service_role;
revoke all on function touch_route_plan_updated_at() from public,anon,authenticated,service_role;
grant execute on function touch_route_plan_updated_at() to public;
grant execute on function touch_route_plan_updated_at() to anon;
grant execute on function touch_route_plan_updated_at() to authenticated;
grant execute on function touch_route_plan_updated_at() to service_role;
revoke all on function private.sync_school_action_agenda_trigger() from public,anon,authenticated,service_role;
revoke all on function private.b2b_audit(uuid,text,jsonb,jsonb,text,text) from public,anon,authenticated,service_role;
revoke all on function b2b_portfolio_command(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function b2b_portfolio_command(text,jsonb) to authenticated;
grant execute on function b2b_portfolio_command(text,jsonb) to service_role;
revoke all on function attendance_touch_updated_at() from public,anon,authenticated,service_role;
grant execute on function attendance_touch_updated_at() to public;
grant execute on function attendance_touch_updated_at() to anon;
grant execute on function attendance_touch_updated_at() to authenticated;
grant execute on function attendance_touch_updated_at() to service_role;
revoke all on function queue_calendar_invite_job(uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function queue_calendar_invite_job(uuid,text,integer) to service_role;
revoke all on function attendance_log_occurrence_change() from public,anon,authenticated,service_role;
grant execute on function attendance_log_occurrence_change() to service_role;
revoke all on function private.b2b_ensure_cycles() from public,anon,authenticated,service_role;
grant execute on function private.b2b_ensure_cycles() to authenticated;
revoke all on function b2b_ensure_cycles() from public,anon,authenticated,service_role;
grant execute on function b2b_ensure_cycles() to authenticated;
grant execute on function b2b_ensure_cycles() to service_role;
revoke all on function private.b2b_guard_departure() from public,anon,authenticated,service_role;
revoke all on function sync_calendar_event_db(text,uuid,uuid,text,timestamp with time zone,timestamp with time zone,text,text,text,text,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function sync_calendar_event_db(text,uuid,uuid,text,timestamp with time zone,timestamp with time zone,text,text,text,text,uuid,boolean) to service_role;
revoke all on function sync_school_action_calendar_trigger() from public,anon,authenticated,service_role;
grant execute on function sync_school_action_calendar_trigger() to service_role;
revoke all on function sync_company_next_action_calendar_trigger() from public,anon,authenticated,service_role;
grant execute on function sync_company_next_action_calendar_trigger() to service_role;
revoke all on function private.b2b_guard_settings() from public,anon,authenticated,service_role;
grant execute on function private.b2b_guard_settings() to authenticated;
grant execute on function private.b2b_guard_settings() to service_role;
revoke all on function private.b2b_guard_cycle() from public,anon,authenticated,service_role;
grant execute on function private.b2b_guard_cycle() to authenticated;
grant execute on function private.b2b_guard_cycle() to service_role;
revoke all on function private.b2b_guard_profile_privileges() from public,anon,authenticated,service_role;
grant execute on function private.b2b_guard_profile_privileges() to authenticated;
grant execute on function private.b2b_guard_profile_privileges() to service_role;
revoke all on function b2b_save_contact(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function b2b_save_contact(uuid,uuid,jsonb) to service_role;
revoke all on function b2b_finish_meeting(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function b2b_finish_meeting(uuid,uuid,jsonb) to service_role;
revoke all on function b2b_stage_meeting(uuid,uuid,integer,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function b2b_stage_meeting(uuid,uuid,integer,text,jsonb) to service_role;
revoke all on function b2b_queue_email_meeting(uuid,text) from public,anon,authenticated,service_role;
grant execute on function b2b_queue_email_meeting(uuid,text) to service_role;
revoke all on function b2b_settle_email_meeting(uuid) from public,anon,authenticated,service_role;
grant execute on function b2b_settle_email_meeting(uuid) to service_role;
revoke all on function configure_school_capture_cycle(uuid,integer,date,date,boolean) from public,anon,authenticated,service_role;
grant execute on function configure_school_capture_cycle(uuid,integer,date,date,boolean) to authenticated;
grant execute on function configure_school_capture_cycle(uuid,integer,date,date,boolean) to service_role;
revoke all on function private.check_password_rotation() from public,anon,authenticated,service_role;
grant execute on function private.check_password_rotation() to anon;
grant execute on function private.check_password_rotation() to authenticated;
grant execute on function private.check_password_rotation() to service_role;
revoke all on function stamp_company_action() from public,anon,authenticated,service_role;
grant execute on function stamp_company_action() to authenticated;
grant execute on function stamp_company_action() to service_role;
revoke all on function private.school_capture_allowed() from public,anon,authenticated,service_role;
grant execute on function private.school_capture_allowed() to authenticated;
revoke all on function private.school_capture_manager() from public,anon,authenticated,service_role;
grant execute on function private.school_capture_manager() to authenticated;
revoke all on function private.school_capture_user_name(uuid) from public,anon,authenticated,service_role;
grant execute on function private.school_capture_user_name(uuid) to authenticated;
revoke all on function private.guard_school_capture_action() from public,anon,authenticated,service_role;
grant execute on function private.guard_school_capture_action() to authenticated;
revoke all on function private.stamp_school_capture_participant() from public,anon,authenticated,service_role;
grant execute on function private.stamp_school_capture_participant() to authenticated;
revoke all on function private.guard_school_capture_result() from public,anon,authenticated,service_role;
grant execute on function private.guard_school_capture_result() to authenticated;
revoke all on function private.audit_school_capture() from public,anon,authenticated,service_role;
revoke all on function save_school_capture(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function save_school_capture(uuid,uuid,text,jsonb) to authenticated;
grant execute on function save_school_capture(uuid,uuid,text,jsonb) to service_role;
revoke all on function b2b_commercial_cycle(date) from public,anon,authenticated,service_role;
grant execute on function b2b_commercial_cycle(date) to authenticated;
grant execute on function b2b_commercial_cycle(date) to service_role;
revoke all on function b2b_valid_activity_type(text) from public,anon,authenticated,service_role;
grant execute on function b2b_valid_activity_type(text) to authenticated;
grant execute on function b2b_valid_activity_type(text) to service_role;
revoke all on function b2b_last_valid_activity(uuid,date) from public,anon,authenticated,service_role;
grant execute on function b2b_last_valid_activity(uuid,date) to authenticated;
grant execute on function b2b_last_valid_activity(uuid,date) to service_role;
revoke all on function private.b2b_manager() from public,anon,authenticated,service_role;
grant execute on function private.b2b_manager() to authenticated;
grant execute on function private.b2b_manager() to service_role;
revoke all on function private.b2b_name(uuid) from public,anon,authenticated,service_role;
grant execute on function private.b2b_name(uuid) to authenticated;
grant execute on function private.b2b_name(uuid) to service_role;
revoke all on function private.b2b_notify(uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
revoke all on function private.b2b_guard_company() from public,anon,authenticated,service_role;
revoke all on function private.b2b_company_history() from public,anon,authenticated,service_role;
revoke all on function private.b2b_stamp_activity() from public,anon,authenticated,service_role;
grant execute on function private.b2b_stamp_activity() to authenticated;
grant execute on function private.b2b_stamp_activity() to service_role;
revoke all on function private.b2b_activity_relationship() from public,anon,authenticated,service_role;
revoke all on function private.b2b_has_pending(uuid) from public,anon,authenticated,service_role;
grant execute on function private.b2b_has_pending(uuid) to authenticated;
grant execute on function private.b2b_has_pending(uuid) to service_role;
revoke all on function private.b2b_review_companies(date) from public,anon,authenticated,service_role;
grant execute on function private.b2b_review_companies(date) to service_role;
revoke all on function private.b2b_review_authenticated() from public,anon,authenticated,service_role;
grant execute on function private.b2b_review_authenticated() to authenticated;
revoke all on function b2b_review_portfolio() from public,anon,authenticated,service_role;
grant execute on function b2b_review_portfolio() to authenticated;
grant execute on function b2b_review_portfolio() to service_role;
revoke all on function private.b2b_portfolio_command(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.b2b_portfolio_command(text,jsonb) to authenticated;
revoke all on function private.password_access_allowed() from public,anon,authenticated,service_role;
grant execute on function private.password_access_allowed() to authenticated;
revoke all on function private.guard_password_state() from public,anon,authenticated,service_role;
revoke all on function private.on_auth_password_changed() from public,anon,authenticated,service_role;
set check_function_bodies=on;
