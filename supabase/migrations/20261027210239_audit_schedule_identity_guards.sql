begin;
-- Preserve identity/ownership even through a direct REST update. Administrative transfers use the audited command.
revoke update(id,owner_id,consultor,relationship_status,relationship_changed_at) on public.companies from authenticated;
-- Appointments need a responsible person and a complete interval. Historical performed actions can remain date-only.
alter table public.school_actions add constraint scheduled_school_action_complete check(
  status not in ('agendada','confirmada','reagendada') or
  (primary_owner_id is not null and start_time is not null and end_time is not null)) not valid;
commit;
