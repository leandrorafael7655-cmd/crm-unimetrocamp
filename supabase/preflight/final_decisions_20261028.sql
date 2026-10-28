-- Read only. Execute at the maintenance window; do not reuse old audit counts.
select current_timestamp as snapshot_at;
select status,count(*) from public.attendance_occurrences group by status;
select status,count(*) from public.calendar_invite_jobs group by status;
select count(*) as stale_processing from public.calendar_invite_jobs
where status='processing' and updated_at<now()-interval '10 minutes';
select calendar_event_id,count(*) from public.calendar_invite_jobs
where status='processing' and calendar_event_id is not null group by 1 having count(*)>1;
select meeting_activity_id,count(*) from public.calendar_invite_jobs
where status='processing' and meeting_activity_id is not null group by 1 having count(*)>1;
-- Review old external recipients. Do not auto-send or delete these payloads.
select count(*) as legacy_external_pending from public.calendar_invite_jobs j
join public.activities a on a.id=j.meeting_activity_id
join public.profiles p on p.id=a.organizer_user_id
where j.status in ('pending','failed','processing') and lower(j.payload->'recipient'->>'email') is distinct from lower(p.email);
with busy as (
  select 'school' as source,e.id,e.recipient_user_id as user_id,tstzrange(e.start_at,e.end_at,'[)') as period
  from public.calendar_events e where e.status='active' and e.source_type='school_action'
  union all
  select 'meeting',a.id,a.organizer_user_id,tstzrange(a.start_at,a.end_at,'[)')
  from public.activities a where a.meeting_type is not null and a.status not in ('cancelada','realizada','nao_compareceu')
  union all
  select 'attendance',o.id,o.user_id,tstzrange((o.occurrence_date+o.start_time) at time zone 'America/Sao_Paulo',(o.occurrence_date+o.end_time) at time zone 'America/Sao_Paulo','[)')
  from public.attendance_occurrences o where o.status='published' and o.activity='external' and o.user_id is not null
)
select a.source,a.id,b.source as conflicting_source,b.id as conflicting_id,a.user_id
from busy a join busy b on a.user_id=b.user_id and (a.source,a.id)<(b.source,b.id) and a.period&&b.period;
-- A database dump includes Storage metadata, not the actual attachment bytes.
select count(*) as storage_objects_to_copy_separately from storage.objects;
