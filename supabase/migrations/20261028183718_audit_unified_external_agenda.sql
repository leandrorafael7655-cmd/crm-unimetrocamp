begin;
alter table public.companies add column next_action_kind text not null default 'internal' check(next_action_kind in ('internal','external'));
alter table public.calendar_events add column all_day boolean not null default false;
grant update(next_action_kind) on public.companies to authenticated;
create table private.external_calendar_reservations (
  source_type text not null,source_id uuid not null,user_id uuid not null references public.profiles(id),
  period tstzrange not null,primary key(source_type,source_id,user_id),
  exclude using gist(user_id with =,period with &&)
);
alter table private.external_calendar_reservations enable row level security;
revoke all on private.external_calendar_reservations from public,anon,authenticated;
grant all on private.external_calendar_reservations to service_role;
create function private.sync_external_reservation() returns trigger language plpgsql security definer set search_path='' as $$
declare key_type text:=tg_table_name; key_id uuid:=coalesce(new.id,old.id); e public.calendar_events; a public.activities; o public.attendance_occurrences;
begin
  delete from private.external_calendar_reservations where source_type=key_type and source_id=key_id;
  if tg_table_name='calendar_events' then
    select * into e from public.calendar_events where id=key_id;
    if e.id is not null and e.status='active' and not e.all_day and
      (e.source_type='school_action' or (e.source_type='company_activity' and exists(select 1 from public.companies c where c.id=e.source_id and c.next_action_kind='external'))) then
      insert into private.external_calendar_reservations values(key_type,key_id,e.recipient_user_id,tstzrange(e.start_at,e.end_at,'[)'));
    end if;
  elsif tg_table_name='activities' then
    select * into a from public.activities where id=key_id;
    if a.id is not null and a.meeting_type is not null and a.status not in ('cancelada','realizada','nao_compareceu') then
      insert into private.external_calendar_reservations values(key_type,key_id,a.organizer_user_id,tstzrange(a.start_at,a.end_at,'[)'));
    end if;
  else
    select * into o from public.attendance_occurrences where id=key_id;
    if o.id is not null and o.status='published' and o.activity='external' and o.user_id is not null then
      insert into private.external_calendar_reservations values(key_type,key_id,o.user_id,tstzrange((o.occurrence_date+o.start_time) at time zone 'America/Sao_Paulo',(o.occurrence_date+o.end_time) at time zone 'America/Sao_Paulo','[)'));
    end if;
  end if;
  return null;
end $$;
revoke all on function private.sync_external_reservation() from public,anon,authenticated;
create constraint trigger external_reservation_calendar after insert or update or delete on public.calendar_events deferrable initially deferred for each row execute function private.sync_external_reservation();
create constraint trigger external_reservation_meeting after insert or update or delete on public.activities deferrable initially deferred for each row execute function private.sync_external_reservation();
create constraint trigger external_reservation_attendance after insert or update or delete on public.attendance_occurrences deferrable initially deferred for each row execute function private.sync_external_reservation();

-- Date-only follow-ups get an all-day invite; no invented hour and no busy reservation.
create or replace function public.sync_company_next_action_calendar_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
declare start_ts timestamptz; end_ts timestamptz; eid uuid; date_only boolean;
begin
  if tg_op='DELETE' then return old; end if;
  if nullif(trim(new.proxima_acao),'') is null or new.data_proxima_acao is null or new.next_action_owner_id is null
    or new.data_proxima_acao<(now() at time zone 'America/Sao_Paulo')::date then
    perform public.sync_calendar_event_db('company_activity',new.id,null,'Próximo passo B2B',now(),now()+interval '1 minute','America/Sao_Paulo',null,null,null,auth.uid(),true);
    return new;
  end if;
  date_only:=new.next_action_start_time is null and new.next_action_end_time is null;
  if not date_only and (new.next_action_start_time is null or new.next_action_end_time is null or new.next_action_end_time<=new.next_action_start_time) then raise exception 'Informe um intervalo válido.'; end if;
  start_ts:=(new.data_proxima_acao+coalesce(new.next_action_start_time,'00:00'::time)) at time zone 'America/Sao_Paulo';
  end_ts:=case when date_only then (new.data_proxima_acao+1)::timestamp at time zone 'America/Sao_Paulo' else (new.data_proxima_acao+new.next_action_end_time) at time zone 'America/Sao_Paulo' end;
  eid:=public.sync_calendar_event_db('company_activity',new.id,new.next_action_owner_id,
    'UniConecta · '||trim(new.proxima_acao)||' · '||coalesce(nullif(new.nome_fantasia,''),new.razao_social),
    start_ts,end_ts,'America/Sao_Paulo',new.next_action_location,null,'/?empresa='||new.id::text,auth.uid(),false);
  update public.calendar_events set all_day=date_only,updated_at=now() where id=eid;
  return new;
end $$;
drop trigger trg_sync_company_next_action_calendar on public.companies;
create trigger trg_sync_company_next_action_calendar after insert or update of proxima_acao,data_proxima_acao,next_action_start_time,next_action_end_time,next_action_location,next_action_owner_id,next_action_kind,nome_fantasia,razao_social on public.companies for each row execute function public.sync_company_next_action_calendar_trigger();
create or replace function public.save_b2b_company_atomic(p_company jsonb,p_contacts jsonb,p_agreement jsonb,p_delete boolean default false,p_create boolean default false)
returns uuid language plpgsql security invoker set search_path='' as $$
declare a public.companies%rowtype; old_row public.companies%rowtype; c public.company_contacts%rowtype;
  agreement public.agreements%rowtype; item jsonb; keep_ids uuid[]:='{}'; actor_role text;
begin
  select role into actor_role from public.profiles where id=auth.uid() and active and not must_change_password and not password_reset_pending;
  if coalesce(actor_role,'') not in ('gerente','supervisor','consultor_b2b','consultor') then raise exception 'Sem permissão B2B.' using errcode='42501'; end if;
  a:=jsonb_populate_record(null::public.companies,p_company);
  a.id:=coalesce(a.id,gen_random_uuid());
  select * into old_row from public.companies where id=a.id for update;
  if found then
    if old_row.owner_id is distinct from auth.uid() and actor_role not in ('gerente','supervisor') then raise exception 'Empresa de outra carteira.' using errcode='42501'; end if;
    if p_delete then
      update public.companies set archived_at=now(),archive_reason='Arquivada pelo fluxo legado' where id=a.id;
      if not found then raise exception 'Exclusão não autorizada.'; end if;
      return a.id;
    end if;
    a:=jsonb_populate_record(old_row,p_company);
    a.owner_id:=old_row.owner_id; a.consultor:=old_row.consultor;
    update public.companies set razao_social=a.razao_social,nome_fantasia=a.nome_fantasia,cnpj=a.cnpj,segmento=a.segmento,colaboradores=a.colaboradores,cidade=a.cidade,bairro=a.bairro,telefone=a.telefone,site=a.site,origem=a.origem,classificacao=a.classificacao,etapa=a.etapa,potencial=a.potencial,possui_beneficio=a.possui_beneficio,observacoes=a.observacoes,logradouro=a.logradouro,numero=a.numero,complemento=a.complemento,cep=a.cep,latitude=a.latitude,longitude=a.longitude,geocoded_at=a.geocoded_at,geocode_precision=a.geocode_precision,ultimo_contato=a.ultimo_contato,proxima_acao=a.proxima_acao,data_proxima_acao=a.data_proxima_acao,next_action_start_time=a.next_action_start_time,next_action_end_time=a.next_action_end_time,next_action_location=a.next_action_location,next_action_owner_id=a.next_action_owner_id,next_action_kind=coalesce(a.next_action_kind,'internal'),data_entrada=a.data_entrada,link_inscricao=a.link_inscricao,link_consultor=a.link_consultor where id=a.id;
    if not found then raise exception 'Gravação não autorizada.'; end if;
  else
    if p_delete or not p_create then raise exception 'Empresa não encontrada ou sem permissão.' using errcode='42501'; end if;
    if actor_role in ('consultor','consultor_b2b') then a.owner_id:=auth.uid(); end if;
    if nullif(btrim(a.razao_social),'') is null then raise exception 'Informe a razão social.'; end if;
    insert into public.companies(id,razao_social,nome_fantasia,cnpj,segmento,colaboradores,cidade,bairro,telefone,site,origem,classificacao,etapa,potencial,possui_beneficio,observacoes,consultor,owner_id,logradouro,numero,complemento,cep,latitude,longitude,geocoded_at,geocode_precision,ultimo_contato,proxima_acao,data_proxima_acao,next_action_start_time,next_action_end_time,next_action_location,next_action_owner_id,next_action_kind,data_entrada,link_inscricao,link_consultor) values(a.id,a.razao_social,a.nome_fantasia,a.cnpj,a.segmento,a.colaboradores,a.cidade,a.bairro,a.telefone,a.site,a.origem,a.classificacao,a.etapa,a.potencial,a.possui_beneficio,a.observacoes,a.consultor,a.owner_id,a.logradouro,a.numero,a.complemento,a.cep,a.latitude,a.longitude,a.geocoded_at,a.geocode_precision,a.ultimo_contato,a.proxima_acao,a.data_proxima_acao,a.next_action_start_time,a.next_action_end_time,a.next_action_location,a.next_action_owner_id,coalesce(a.next_action_kind,'internal'),a.data_entrada,a.link_inscricao,a.link_consultor);
  end if;
  if jsonb_typeof(p_contacts)<>'array' then raise exception 'Contatos inválidos.'; end if;
  if (select count(*) from jsonb_array_elements(p_contacts) x where (x->>'is_primary')::boolean)>1 then raise exception 'Selecione somente um contato principal.'; end if;
  update public.company_contacts set is_primary=false where company_id=a.id and is_primary;
  for item in select * from jsonb_array_elements(p_contacts) loop
    c:=jsonb_populate_record(null::public.company_contacts,item);
    c.id:=coalesce(c.id,gen_random_uuid()); c.company_id:=a.id;
    c.nome:=coalesce(c.nome,''); c.position:=coalesce(c.position,0); c.is_primary:=coalesce(c.is_primary,false);
    if exists(select 1 from public.company_contacts where id=c.id and company_id<>a.id) then raise exception 'Contato de outra empresa.'; end if;
    keep_ids:=array_append(keep_ids,c.id);
    insert into public.company_contacts(id,company_id,nome,papel,cargo,telefone,email,observacoes,is_primary,position) values(c.id,c.company_id,c.nome,c.papel,c.cargo,c.telefone,c.email,c.observacoes,c.is_primary,c.position) on conflict(id) do update set nome=excluded.nome,papel=excluded.papel,cargo=excluded.cargo,telefone=excluded.telefone,email=excluded.email,observacoes=excluded.observacoes,is_primary=excluded.is_primary,position=excluded.position;
  end loop;
  delete from public.company_contacts where company_id=a.id and not(id=any(keep_ids));
  if p_agreement is null or p_agreement='null'::jsonb then
    delete from public.agreements where company_id=a.id;
  else
    select * into agreement from public.agreements where company_id=a.id;
    agreement:=jsonb_populate_record(agreement,p_agreement);
    agreement.id:=coalesce(agreement.id,gen_random_uuid()); agreement.company_id:=a.id;
    agreement.ativo:=coalesce(agreement.ativo,true);
    insert into public.agreements(id,company_id,ativo,status,data_inicio,percentual,cursos,modalidades,dependentes,contrapartidas,responsavel_assinatura,contrato,ultima_divulgacao,inscricoes,matriculas_financeiras,matriculas_academicas,observacoes) values(agreement.id,agreement.company_id,agreement.ativo,agreement.status,agreement.data_inicio,agreement.percentual,agreement.cursos,agreement.modalidades,agreement.dependentes,agreement.contrapartidas,agreement.responsavel_assinatura,agreement.contrato,agreement.ultima_divulgacao,agreement.inscricoes,agreement.matriculas_financeiras,agreement.matriculas_academicas,agreement.observacoes) on conflict(company_id) do update set ativo=excluded.ativo,status=excluded.status,data_inicio=excluded.data_inicio,percentual=excluded.percentual,cursos=excluded.cursos,modalidades=excluded.modalidades,dependentes=excluded.dependentes,contrapartidas=excluded.contrapartidas,responsavel_assinatura=excluded.responsavel_assinatura,contrato=excluded.contrato,ultima_divulgacao=excluded.ultima_divulgacao,inscricoes=excluded.inscricoes,matriculas_financeiras=excluded.matriculas_financeiras,matriculas_academicas=excluded.matriculas_academicas,observacoes=excluded.observacoes;
  end if;
  return a.id;
end $$;
revoke all on function public.save_b2b_company_atomic(jsonb,jsonb,jsonb,boolean,boolean) from public,anon;
grant execute on function public.save_b2b_company_atomic(jsonb,jsonb,jsonb,boolean,boolean) to authenticated;


create or replace function public.save_b2b_interaction_atomic(p_activity jsonb,p_company jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare a public.activities%rowtype; c public.companies%rowtype;
begin
  a:=jsonb_populate_record(null::public.activities,p_activity);
  c:=jsonb_populate_record(null::public.companies,p_company);
  if a.company_id is distinct from c.id then raise exception 'Empresa inválida.'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and active and not must_change_password and not password_reset_pending and role in('gerente','supervisor','consultor_b2b','consultor')) then raise exception 'Acesso não autorizado.' using errcode='42501'; end if;
  perform 1 from public.companies where id=c.id for update;
  if not found then raise exception 'Empresa não encontrada.'; end if;
  -- RLS and b2b_stamp_activity enforce ownership and derive the commercial actor.
  if a.meeting_type is not null then raise exception 'Use o fluxo de reuniões para convites.'; end if;
  insert into public.activities(id,company_id,consultor,data,tipo,contato,resultado,observacao,leads,impactados,etapa_anterior,etapa_nova,proxima_acao,data_proximo_contato,primary_owner_id)
  values(a.id,a.company_id,a.consultor,a.data,a.tipo,a.contato,a.resultado,a.observacao,a.leads,a.impactados,a.etapa_anterior,a.etapa_nova,a.proxima_acao,a.data_proximo_contato,auth.uid());
  update public.companies set ultimo_contato=c.ultimo_contato,etapa=c.etapa,proxima_acao=c.proxima_acao,data_proxima_acao=c.data_proxima_acao,
    next_action_start_time=c.next_action_start_time,next_action_end_time=c.next_action_end_time,next_action_location=c.next_action_location,next_action_owner_id=c.next_action_owner_id,next_action_kind=coalesce(c.next_action_kind,'internal')
    where id=c.id;
  if not found then raise exception 'Não foi possível atualizar o próximo passo.' using errcode='42501'; end if;
  return a.id;
end $$;
revoke all on function public.save_b2b_interaction_atomic(jsonb,jsonb) from public,anon;
grant execute on function public.save_b2b_interaction_atomic(jsonb,jsonb) to authenticated;

-- Backfill reservations only: never re-enqueue or send historical invites.
insert into private.external_calendar_reservations
select 'calendar_events',e.id,e.recipient_user_id,tstzrange(e.start_at,e.end_at,'[)') from public.calendar_events e
where e.status='active' and not e.all_day and e.source_type='school_action';
insert into private.external_calendar_reservations
select 'activities',a.id,a.organizer_user_id,tstzrange(a.start_at,a.end_at,'[)') from public.activities a
where a.meeting_type is not null and a.status not in ('cancelada','realizada','nao_compareceu');
insert into private.external_calendar_reservations
select 'attendance_occurrences',o.id,o.user_id,tstzrange((o.occurrence_date+o.start_time) at time zone 'America/Sao_Paulo',(o.occurrence_date+o.end_time) at time zone 'America/Sao_Paulo','[)') from public.attendance_occurrences o
where o.status='published' and o.activity='external' and o.user_id is not null;
create or replace view public.b2b_company_portfolio with(security_invoker=true) as
select original.*,c.archived_at,c.next_action_kind from ( WITH base AS (
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
   FROM state) original join public.companies c on c.id=original.id where c.archived_at is null;

-- Manual agenda appointments and cycle publication share the same transactional outbox.
alter table public.attendance_occurrences add constraint published_attendance_has_user check(status<>'published' or user_id is not null) not valid;
create function private.sync_attendance_calendar() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.attendance_occurrences; key_id uuid:=coalesce(new.id,old.id);
begin
  select * into r from public.attendance_occurrences where id=key_id;
  if r.id is null or r.status<>'published' then
    perform public.sync_calendar_event_db('attendance',key_id,null,'Compromisso cancelado',now(),now()+interval '1 minute','America/Sao_Paulo',null,null,null,auth.uid(),true);
    return null;
  end if;
  if not exists(select 1 from public.profiles where id=r.user_id and active and nullif(email,'') is not null) then raise exception 'Compromisso exige um responsável ativo com e-mail.'; end if;
  perform public.sync_calendar_event_db('attendance',r.id,r.user_id,
    'UniConecta · '||case r.activity when 'room' then 'Sala de matrícula' when 'conversion' then 'Conversão' when 'external' then 'Atividade externa' when 'gdc' then 'GDC' else 'Evento' end,
    (r.occurrence_date+r.start_time) at time zone 'America/Sao_Paulo',(r.occurrence_date+r.end_time) at time zone 'America/Sao_Paulo',
    'America/Sao_Paulo',r.location,r.notes,'/atendimento/minha-agenda',coalesce(auth.uid(),r.updated_by,r.created_by),false);
  return null;
end $$;
revoke all on function private.sync_attendance_calendar() from public,anon,authenticated;
create constraint trigger attendance_calendar_outbox after insert or update or delete on public.attendance_occurrences
  deferrable initially deferred for each row execute function private.sync_attendance_calendar();
commit;
