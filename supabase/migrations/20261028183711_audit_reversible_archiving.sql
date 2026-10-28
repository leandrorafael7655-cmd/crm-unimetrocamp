begin;
alter table public.companies add column archived_at timestamptz,add column archived_by uuid references public.profiles(id),add column archive_reason text;
alter table public.schools add column archived_at timestamptz,add column archived_by uuid references public.profiles(id),add column archive_reason text;
grant update(archived_at,archive_reason) on public.companies,public.schools to authenticated;
create index companies_active on public.companies(owner_id) where archived_at is null;
create index schools_active on public.schools(name) where archived_at is null;
create table public.commercial_archive_history (
  id uuid primary key default gen_random_uuid(),entity_type text not null check(entity_type in('company','school')),
  entity_id uuid not null,archived boolean not null,reason text,changed_by uuid references public.profiles(id),changed_at timestamptz not null default now()
);
alter table public.commercial_archive_history enable row level security;
create policy commercial_archive_history_read on public.commercial_archive_history for select to authenticated using(exists(select 1 from public.profiles where id=auth.uid() and active and not must_change_password and not password_reset_pending));
revoke all on public.commercial_archive_history from public,anon,authenticated;
grant select on public.commercial_archive_history to authenticated;
grant all on public.commercial_archive_history to service_role;
revoke all on public.commercial_archive_history from anon;
create function private.guard_commercial_archive() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Exclusão física proibida. Arquive o registro para preservar o histórico.'; end if;
  if tg_op='INSERT' then
    if new.archived_at is not null then raise exception 'Crie o cadastro ativo antes de arquivar.'; end if;
    new.archived_by:=null; new.archive_reason:=null; return new;
  end if;
  if new.archived_at is distinct from old.archived_at then
    if auth.uid() is null then raise exception 'Informe um responsável autenticado para arquivar.'; end if;
    new.archived_at:=case when new.archived_at is null then null else now() end;
    new.archived_by:=auth.uid();
    insert into public.commercial_archive_history(entity_type,entity_id,archived,reason,changed_by)
      values(case when tg_table_name='companies' then 'company' else 'school' end,new.id,new.archived_at is not null,left(new.archive_reason,1000),auth.uid());
  else new.archived_by:=old.archived_by; end if;
  return new;
end $$;
revoke all on function private.guard_commercial_archive() from public,anon,authenticated;
create trigger guard_company_archive before insert or update or delete on public.companies for each row execute function private.guard_commercial_archive();
create trigger guard_school_archive before insert or update or delete on public.schools for each row execute function private.guard_commercial_archive();

create function public.set_commercial_archive(p_type text,p_id uuid,p_archived boolean,p_reason text default null)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if p_type='company' then
    update public.companies set archived_at=case when p_archived then coalesce(archived_at,now()) else null end,archive_reason=left(p_reason,1000) where id=p_id;
  elsif p_type='school' then
    update public.schools set archived_at=case when p_archived then coalesce(archived_at,now()) else null end,archive_reason=left(p_reason,1000) where id=p_id;
  else raise exception 'Cadastro inválido.'; end if;
  if not found then raise exception 'Cadastro não encontrado ou sem permissão.' using errcode='42501'; end if;
end $$;
revoke all on function public.set_commercial_archive(text,uuid,boolean,text) from public,anon;
grant execute on function public.set_commercial_archive(text,uuid,boolean,text) to authenticated;
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
    update public.companies set razao_social=a.razao_social,nome_fantasia=a.nome_fantasia,cnpj=a.cnpj,segmento=a.segmento,colaboradores=a.colaboradores,cidade=a.cidade,bairro=a.bairro,telefone=a.telefone,site=a.site,origem=a.origem,classificacao=a.classificacao,etapa=a.etapa,potencial=a.potencial,possui_beneficio=a.possui_beneficio,observacoes=a.observacoes,logradouro=a.logradouro,numero=a.numero,complemento=a.complemento,cep=a.cep,latitude=a.latitude,longitude=a.longitude,geocoded_at=a.geocoded_at,geocode_precision=a.geocode_precision,ultimo_contato=a.ultimo_contato,proxima_acao=a.proxima_acao,data_proxima_acao=a.data_proxima_acao,next_action_start_time=a.next_action_start_time,next_action_end_time=a.next_action_end_time,next_action_location=a.next_action_location,next_action_owner_id=a.next_action_owner_id,data_entrada=a.data_entrada,link_inscricao=a.link_inscricao,link_consultor=a.link_consultor where id=a.id;
    if not found then raise exception 'Gravação não autorizada.'; end if;
  else
    if p_delete or not p_create then raise exception 'Empresa não encontrada ou sem permissão.' using errcode='42501'; end if;
    if actor_role in ('consultor','consultor_b2b') then a.owner_id:=auth.uid(); end if;
    if nullif(btrim(a.razao_social),'') is null then raise exception 'Informe a razão social.'; end if;
    insert into public.companies(id,razao_social,nome_fantasia,cnpj,segmento,colaboradores,cidade,bairro,telefone,site,origem,classificacao,etapa,potencial,possui_beneficio,observacoes,consultor,owner_id,logradouro,numero,complemento,cep,latitude,longitude,geocoded_at,geocode_precision,ultimo_contato,proxima_acao,data_proxima_acao,next_action_start_time,next_action_end_time,next_action_location,next_action_owner_id,data_entrada,link_inscricao,link_consultor) values(a.id,a.razao_social,a.nome_fantasia,a.cnpj,a.segmento,a.colaboradores,a.cidade,a.bairro,a.telefone,a.site,a.origem,a.classificacao,a.etapa,a.potencial,a.possui_beneficio,a.observacoes,a.consultor,a.owner_id,a.logradouro,a.numero,a.complemento,a.cep,a.latitude,a.longitude,a.geocoded_at,a.geocode_precision,a.ultimo_contato,a.proxima_acao,a.data_proxima_acao,a.next_action_start_time,a.next_action_end_time,a.next_action_location,a.next_action_owner_id,a.data_entrada,a.link_inscricao,a.link_consultor);
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


create or replace view public.b2b_company_portfolio with(security_invoker=true) as
select original.*,c.archived_at from ( WITH base AS (
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
commit;
