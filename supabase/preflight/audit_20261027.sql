-- Read-only. Run immediately before applying the audit migrations, with the administrator.
select count(*) as active_managers from public.profiles where active and role='gerente';
select 'companies' as source,regexp_replace(upper(cnpj),'[./[:space:]-]','','g') as canonical_cnpj,count(*)
from public.companies where nullif(btrim(cnpj),'') is not null group by 2 having count(*)>1;
select 'schools' as source,regexp_replace(upper(cnpj),'[./[:space:]-]','','g') as canonical_cnpj,count(*)
from public.schools where nullif(btrim(cnpj),'') is not null group by 2 having count(*)>1;
select id from public.school_actions where (start_time is null)<>(end_time is null) or end_time<=start_time or end_time='24:00'::time;
select id from public.school_actions where status in('agendada','confirmada','reagendada') and
  (primary_owner_id is null or start_time is null or end_time is null);
select id from public.route_plans where return_time is not null and
  (departure_time is null or return_time<=departure_time or return_time='24:00'::time);
with reservations as (
  select distinct a.id,u.user_id,tsrange(a.action_date+a.start_time,a.action_date+a.end_time,'[)') as period
  from public.school_actions a cross join lateral (
    select a.primary_owner_id as user_id union select p.user_id from public.school_action_participants p where p.school_action_id=a.id
  ) u where u.user_id is not null and a.status in('agendada','confirmada','reagendada') and a.start_time is not null and a.end_time>a.start_time
)
select r.id as action_id,s.id as conflicting_action_id,r.user_id from reservations r join reservations s
  on r.user_id=s.user_id and r.id<s.id and r.period&&s.period;
select status,count(*),count(*) filter(where user_id is null) as without_user from public.attendance_occurrences group by status;
-- After migrations, before VALIDATE CONSTRAINT: inspect historical invalid CNPJs.
-- select id from public.companies where not public.valid_cnpj(cnpj);
-- select id from public.schools where not public.valid_cnpj(cnpj);
