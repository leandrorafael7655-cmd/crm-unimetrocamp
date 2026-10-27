begin;
alter table public.attendance_settings add column min_saturday_coverage integer not null default 2 check(min_saturday_coverage>=2);
alter table public.attendance_settings add column gdc_start time;
alter table public.attendance_settings add column gdc_coverage_mode text not null default 'pending' check(gdc_coverage_mode in ('pending','pause','backup'));
-- Only confirmed operating parameters change; drafts, members and assignments do not.
update public.attendance_settings set weekday_room_open='09:00',weekday_room_close='20:00',saturday_start='09:00',saturday_end='13:00',min_room_coverage=3;
alter table public.attendance_settings add constraint attendance_confirmed_coverage check(min_room_coverage>=3) not valid;
alter table public.attendance_occurrences drop constraint attendance_occurrences_activity_check;
alter table public.attendance_occurrences add constraint attendance_occurrences_activity_check check(activity in ('room','conversion','external','gdc','event'));

create function public.publish_attendance_cycle_atomic(p_actor uuid,p_cycle uuid,p_versions jsonb,p_settings_version timestamptz)
returns integer language plpgsql security invoker set search_path='' as $$
declare c public.attendance_cycles%rowtype; o public.attendance_occurrences%rowtype; s public.attendance_settings%rowtype; total integer;
begin
  if not exists(select 1 from public.profiles where id=p_actor and active and role in ('gerente','supervisor') and not must_change_password and not password_reset_pending) then
    raise exception 'Sem permissão para publicar escala.' using errcode='42501';
  end if;
  select * into c from public.attendance_cycles where id=p_cycle for update;
  if not found or c.status='cancelled' then raise exception 'Rascunho não encontrado.'; end if;
  select * into s from public.attendance_settings where id=1 for share;
  if s.updated_at is distinct from p_settings_version then raise exception 'Configuração alterada. Revise a prévia novamente.'; end if;
  if s.gdc_start is null or s.gdc_coverage_mode='pending' then raise exception 'Defina o GDC e a cobertura ou pausa da SM antes de publicar.'; end if;
  perform 1 from public.attendance_occurrences where cycle_id=p_cycle order by id for update;
  select count(*) into total from public.attendance_occurrences where cycle_id=p_cycle and status<>'cancelled';
  if total=0 or total<>jsonb_array_length(p_versions) or exists(
      select 1 from public.attendance_occurrences r where r.cycle_id=p_cycle and r.status<>'cancelled' and not exists(
        select 1 from jsonb_array_elements(p_versions) v where (v->>'id')::uuid=r.id and (v->>'updated_at')::timestamptz=r.updated_at)) then
    raise exception 'Escala alterada durante a revisão. Recarregue e valide novamente.';
  end if;
  if exists(select 1 from public.attendance_occurrences r left join public.profiles u on u.id=r.user_id
      where r.cycle_id=p_cycle and r.status<>'cancelled' and (u.id is null or not u.active or nullif(u.email,'') is null)) then
    raise exception 'Há compromissos sem responsável ativo.';
  end if;
  update public.attendance_occurrences set status='published',published_by=p_actor,published_at=now(),updated_by=p_actor where cycle_id=p_cycle and status<>'cancelled';
  for o in select * from public.attendance_occurrences where cycle_id=p_cycle and status='published' loop
    perform public.sync_calendar_event_db('attendance',o.id,o.user_id,
      'UniConecta · '||case o.activity when 'room' then 'Sala de matrícula' when 'conversion' then 'Conversão' when 'external' then 'Atividade externa' when 'gdc' then 'GDC' else 'Evento' end,
      (o.occurrence_date+o.start_time) at time zone 'America/Sao_Paulo',(o.occurrence_date+o.end_time) at time zone 'America/Sao_Paulo',
      'America/Sao_Paulo',o.location,o.notes,'/atendimento/minha-agenda',p_actor,false);
  end loop;
  update public.attendance_cycles set status='published',published_by=p_actor,published_at=now() where id=p_cycle;
  return total;
end $$;
revoke all on function public.publish_attendance_cycle_atomic(uuid,uuid,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.publish_attendance_cycle_atomic(uuid,uuid,jsonb,timestamptz) to service_role;
commit;
