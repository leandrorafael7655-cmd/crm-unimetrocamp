begin;
-- SECURITY INVOKER keeps the existing row policies and calendar/audit triggers.
create function public.save_school_action_atomic(p_id uuid,p_action jsonb,p_participants jsonb,p_results jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare action_id uuid; a public.school_actions%rowtype; part jsonb; result jsonb;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and active
      and not must_change_password and not password_reset_pending and role in ('gerente','supervisor','high_school')) then
    raise exception 'Sem permissão para editar ações escolares.' using errcode='42501';
  end if;
  if jsonb_typeof(p_participants)<>'array' or jsonb_typeof(p_results)<>'array' then raise exception 'Participantes ou resultados inválidos.'; end if;
  a:=jsonb_populate_record(null::public.school_actions,p_action);
  if a.school_id is null or a.action_date is null then raise exception 'Informe a escola e a data.'; end if;
  if p_id is not null then
    perform 1 from public.school_actions where id=p_id for update;
    if not found then raise exception 'Ação não encontrada ou sem permissão.' using errcode='42501'; end if;
    action_id:=p_id;
    update public.school_actions set school_id=a.school_id,action_date=a.action_date,start_time=a.start_time,end_time=a.end_time,
      action_type=a.action_type,objective=a.objective,status=a.status,estimated_students=a.estimated_students,
      estimated_classes=a.estimated_classes,notes=a.notes,result_notes=a.result_notes,primary_owner_id=a.primary_owner_id,
      supervest_cycle_id=a.supervest_cycle_id,commercial_cycle_id=a.commercial_cycle_id where id=action_id;
  else
    insert into public.school_actions(school_id,action_date,start_time,end_time,action_type,objective,status,estimated_students,
      estimated_classes,notes,result_notes,primary_owner_id,supervest_cycle_id,commercial_cycle_id,created_by)
    values(a.school_id,a.action_date,a.start_time,a.end_time,a.action_type,a.objective,a.status,a.estimated_students,
      a.estimated_classes,a.notes,a.result_notes,a.primary_owner_id,a.supervest_cycle_id,a.commercial_cycle_id,auth.uid()) returning id into action_id;
  end if;
  if exists(select 1 from jsonb_array_elements(p_participants) p where not exists(
      select 1 from public.profiles u where u.id=(p->>'user_id')::uuid and (u.active or exists(
        select 1 from public.school_action_participants old where old.school_action_id=action_id and old.user_id=u.id)))) then
    raise exception 'Participante inexistente ou inativo.';
  end if;
  if (select count(*) from jsonb_array_elements(p_participants))<>(select count(distinct p->>'user_id') from jsonb_array_elements(p_participants) p) then
    raise exception 'Participante duplicado.';
  end if;
  -- Update stable composite keys; only participants actually removed are deleted.
  delete from public.school_action_participants old where old.school_action_id=action_id
    and not exists(select 1 from jsonb_array_elements(p_participants) p where (p->>'user_id')::uuid=old.user_id);
  for part in select * from jsonb_array_elements(p_participants) loop
    insert into public.school_action_participants(school_action_id,user_id,role_in_action)
      values(action_id,(part->>'user_id')::uuid,part->>'role_in_action')
      on conflict(school_action_id,user_id) do update set role_in_action=excluded.role_in_action;
  end loop;
  if (select count(*) from jsonb_array_elements(p_results))<>(select count(distinct r->>'grade') from jsonb_array_elements(p_results) r) then
    raise exception 'Série duplicada.';
  end if;
  delete from public.school_action_grade_results old where old.school_action_id=action_id
    and not exists(select 1 from jsonb_array_elements(p_results) r where r->>'grade'=old.grade);
  for result in select * from jsonb_array_elements(p_results) loop
    if not exists(select 1 from public.grade_levels where code=result->>'grade') then raise exception 'Série inválida.'; end if;
    insert into public.school_action_grade_results(school_action_id,grade,classes_count,estimated_impacted,leads,supervest_registrations)
      values(action_id,result->>'grade',(result->>'classes_count')::int,(result->>'estimated_impacted')::int,
        coalesce((result->>'leads')::int,0),coalesce((result->>'supervest_registrations')::int,0))
      on conflict(school_action_id,grade) do update set classes_count=excluded.classes_count,
        estimated_impacted=excluded.estimated_impacted,leads=excluded.leads,supervest_registrations=excluded.supervest_registrations;
  end loop;
  update public.schools set last_action_at=(select max(action_date) from public.school_actions where school_id=a.school_id and status='realizada') where id=a.school_id;
  return action_id;
end $$;
revoke all on function public.save_school_action_atomic(uuid,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.save_school_action_atomic(uuid,jsonb,jsonb,jsonb) to authenticated;

create function public.save_route_plan_atomic(p_id uuid,p_plan jsonb,p_stops jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare plan_id uuid; a public.route_plans%rowtype; stop jsonb; stop_id uuid; retained uuid[]:='{}';
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and active and not must_change_password and not password_reset_pending) then
    raise exception 'Acesso não autorizado.' using errcode='42501';
  end if;
  a:=jsonb_populate_record(null::public.route_plans,p_plan);
  if nullif(btrim(a.route_name),'') is null or length(a.route_name)>120 then raise exception 'Informe um nome de rota com até 120 caracteres.'; end if;
  if a.plan_date is null or jsonb_typeof(p_stops)<>'array' then raise exception 'Plano inválido.'; end if;
  if jsonb_array_length(p_stops)>100 then raise exception 'Divida o roteiro em planos menores.'; end if;
  if (select count(*) from jsonb_array_elements(p_stops))<>(select count(distinct s->>'sort_order') from jsonb_array_elements(p_stops) s) then
    raise exception 'Ordem de paradas duplicada.';
  end if;
  if (select count(*) from jsonb_array_elements(p_stops))<>(select count(distinct (s->>'entity_type',s->>'entity_id')) from jsonb_array_elements(p_stops) s) then
    raise exception 'Local duplicado na rota.';
  end if;
  if p_id is not null then
    perform 1 from public.route_plans where id=p_id and owner_id=auth.uid() for update;
    if not found then raise exception 'Rota não encontrada ou sem permissão.' using errcode='42501'; end if;
    plan_id:=p_id;
    update public.route_plans set route_name=a.route_name,plan_date=a.plan_date,origin_label=a.origin_label,origin_lat=a.origin_lat,
      origin_lng=a.origin_lng,destination_label=a.destination_label,destination_lat=a.destination_lat,destination_lng=a.destination_lng,
      departure_time=a.departure_time,return_time=a.return_time,avg_visit_minutes=a.avg_visit_minutes,status=a.status,
      optimized_at=a.optimized_at,total_distance_m=a.total_distance_m,total_duration_s=a.total_duration_s,notes=a.notes where id=plan_id;
  else
    insert into public.route_plans(owner_id,route_name,plan_date,origin_label,origin_lat,origin_lng,destination_label,destination_lat,
      destination_lng,departure_time,return_time,avg_visit_minutes,status,optimized_at,total_distance_m,total_duration_s,notes)
    values(auth.uid(),a.route_name,a.plan_date,a.origin_label,a.origin_lat,a.origin_lng,a.destination_label,a.destination_lat,
      a.destination_lng,a.departure_time,a.return_time,a.avg_visit_minutes,a.status,a.optimized_at,a.total_distance_m,a.total_duration_s,a.notes) returning id into plan_id;
  end if;
  for stop in select * from jsonb_array_elements(p_stops) loop
    if (stop->>'entity_type'='company' and not exists(select 1 from public.companies where id=(stop->>'entity_id')::uuid))
      or (stop->>'entity_type'='school' and not exists(select 1 from public.schools where id=(stop->>'entity_id')::uuid)) then
      raise exception 'Local não encontrado ou sem permissão.';
    end if;
    select id into stop_id from public.route_stops where route_plan_id=plan_id
      and entity_type=stop->>'entity_type' and entity_id=(stop->>'entity_id')::uuid for update;
    stop_id:=coalesce(stop_id,gen_random_uuid());
    retained:=array_append(retained,stop_id);
    insert into public.route_stops(id,route_plan_id,entity_type,entity_id,sort_order,fixed_time,estimated_arrival,visit_minutes,notes)
      values(stop_id,plan_id,stop->>'entity_type',(stop->>'entity_id')::uuid,(stop->>'sort_order')::int,
        nullif(stop->>'fixed_time','')::time,nullif(stop->>'estimated_arrival','')::time,(stop->>'visit_minutes')::int,stop->>'notes')
      on conflict(id) do update set sort_order=excluded.sort_order,fixed_time=excluded.fixed_time,
        estimated_arrival=excluded.estimated_arrival,visit_minutes=excluded.visit_minutes,notes=excluded.notes;
  end loop;
  delete from public.route_stops where route_plan_id=plan_id and not (id=any(retained));
  return plan_id;
end $$;
revoke all on function public.save_route_plan_atomic(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.save_route_plan_atomic(uuid,jsonb,jsonb) to authenticated;
commit;
