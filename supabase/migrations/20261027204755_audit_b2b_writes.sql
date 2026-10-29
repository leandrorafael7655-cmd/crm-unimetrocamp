begin;
create function public.save_b2b_company_atomic(p_company jsonb,p_contacts jsonb,p_agreement jsonb,p_delete boolean default false,p_create boolean default false)
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
      delete from public.companies where id=a.id;
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

create function public.save_b2b_interaction_atomic(p_activity jsonb,p_company jsonb)
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
    next_action_start_time=c.next_action_start_time,next_action_end_time=c.next_action_end_time,next_action_location=c.next_action_location,next_action_owner_id=c.next_action_owner_id
    where id=c.id;
  if not found then raise exception 'Não foi possível atualizar o próximo passo.' using errcode='42501'; end if;
  return a.id;
end $$;
revoke all on function public.save_b2b_interaction_atomic(jsonb,jsonb) from public,anon;
grant execute on function public.save_b2b_interaction_atomic(jsonb,jsonb) to authenticated;
commit;
