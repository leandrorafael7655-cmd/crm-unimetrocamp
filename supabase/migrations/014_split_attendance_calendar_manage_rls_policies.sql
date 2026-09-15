-- Evita políticas permissivas SELECT duplicadas: leitura continua em policy própria;
-- gerência recebe INSERT/UPDATE/DELETE separados.

do $$
declare
  t text;
  manage_policy text;
begin
  foreach t in array array[
    'attendance_absences',
    'attendance_exceptions',
    'attendance_invite_jobs',
    'attendance_members',
    'attendance_occurrences',
    'attendance_rotation_template',
    'attendance_settings',
    'attendance_team_slots',
    'calendar_events',
    'calendar_invite_jobs'
  ] loop
    manage_policy := case t
      when 'attendance_absences' then 'attendance_absences_manage'
      when 'attendance_exceptions' then 'attendance_exceptions_manage'
      when 'attendance_invite_jobs' then 'attendance_invite_jobs_manage'
      when 'attendance_members' then 'attendance_members_manage'
      when 'attendance_occurrences' then 'attendance_occurrences_manage'
      when 'attendance_rotation_template' then 'attendance_rotation_template_manage'
      when 'attendance_settings' then 'attendance_settings_manage'
      when 'attendance_team_slots' then 'attendance_team_slots_manage'
      when 'calendar_events' then 'calendar_events_manage'
      when 'calendar_invite_jobs' then 'calendar_invite_jobs_manage'
    end;

    execute format('drop policy if exists %I on public.%I', manage_policy, t);
    execute format('drop policy if exists %I on public.%I', t || '_manager_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_manager_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_manager_delete', t);

    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select public.is_manager()))',
      t || '_manager_insert', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select public.is_manager())) with check ((select public.is_manager()))',
      t || '_manager_update', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select public.is_manager()))',
      t || '_manager_delete', t
    );
  end loop;
end $$;

drop policy if exists attendance_cycles_manage_write on public.attendance_cycles;
drop policy if exists attendance_cycles_manager_insert on public.attendance_cycles;
drop policy if exists attendance_cycles_manager_update on public.attendance_cycles;
drop policy if exists attendance_cycles_manager_delete on public.attendance_cycles;
create policy attendance_cycles_manager_insert on public.attendance_cycles
  for insert to authenticated with check ((select public.is_manager()));
create policy attendance_cycles_manager_update on public.attendance_cycles
  for update to authenticated using ((select public.is_manager())) with check ((select public.is_manager()));
create policy attendance_cycles_manager_delete on public.attendance_cycles
  for delete to authenticated using ((select public.is_manager()));
