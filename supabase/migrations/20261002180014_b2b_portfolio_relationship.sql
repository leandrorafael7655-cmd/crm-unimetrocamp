-- Reuses companies.owner_id, agreements, activities, company_actions and the
-- existing calendar. No commercial event is synthesized by an assignment.
alter table public.companies
  add column relationship_status text not null default 'inactive' check (relationship_status in ('active','inactive')),
  add column relationship_changed_at timestamptz not null default now();
alter table public.app_settings
  add column b2b_risk_days integer not null default 30 check (b2b_risk_days between 1 and 90),
  add column b2b_critical_days integer not null default 15 check (b2b_critical_days between 1 and b2b_risk_days);

-- The only cycle calculation. All consumers receive this result, including
-- the browser, goals, actions, notifications, history and reports.
create function public.b2b_commercial_cycle(p_date date) returns jsonb
language sql immutable strict security invoker set search_path = '' as $$
  with c as (
    select extract(year from p_date)::int + case when extract(month from p_date)>=10 then 1 else 0 end y,
      case when extract(month from p_date) between 5 and 9 then 2 else 1 end n
  ) select jsonb_build_object('code',lpad((y%100)::text,2,'0')||'.'||n,
    'name',n||'º Ciclo '||y,'start',case when n=1 then make_date(y-1,10,1) else make_date(y,5,1) end,
    'end',case when n=1 then make_date(y,4,30) else make_date(y,9,30) end,
    'year',y,'number',n,'ordinal',y*2+n) from c;
$$;
revoke all on function public.b2b_commercial_cycle(date) from public,anon;
grant execute on function public.b2b_commercial_cycle(date) to authenticated,service_role;

create function public.b2b_valid_activity_type(p_type text) returns boolean
language sql immutable security invoker set search_path = '' as $$
 select lower(btrim(coalesce(p_type,''))) = any(array[
 'visita','visita presencial','reunião','reunião presencial','reunião on-line','reunião online',
 'reunião de relacionamento','apresentação de proposta','feira ou evento','evento','palestra',
 'plantão comercial','divulgação','divulgação online','ação presencial','ativação','renovação de convênio']);
$$;
revoke all on function public.b2b_valid_activity_type(text) from public,anon;
grant execute on function public.b2b_valid_activity_type(text) to authenticated,service_role;

create function public.b2b_last_valid_activity(p_company uuid, p_day date)
returns table(id uuid,source text,action_type text,action_date date,user_id uuid,user_name text)
language sql stable security invoker set search_path = '' as $$
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
$$;
revoke all on function public.b2b_last_valid_activity(uuid,date) from public,anon;
grant execute on function public.b2b_last_valid_activity(uuid,date) to authenticated,service_role;

create table public.company_portfolio_history (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete restrict,
 kind text not null check(kind in('assignment','relationship','request')),
 previous_value jsonb not null default '{}',new_value jsonb not null default '{}',
 reason text not null,notes text,changed_by uuid references public.profiles(id) on delete restrict,
 changed_by_name text not null,created_at timestamptz not null default now()
);
create index company_portfolio_history_company_idx on public.company_portfolio_history(company_id,created_at desc);
create index company_portfolio_history_actor_idx on public.company_portfolio_history(changed_by);
create index company_portfolio_history_kind_date_idx on public.company_portfolio_history(kind,created_at);

create table public.company_assignment_requests (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id) on delete restrict,
 requested_by uuid not null references public.profiles(id) on delete restrict,
 requested_by_name text not null,previous_owner_id uuid references public.profiles(id) on delete restrict,
 previous_owner_name text,relationship_version timestamptz not null,
 reason text not null check(reason in('Possuo contato','Identifiquei oportunidade','Empresa da minha região',
   'Tenho relacionamento com o responsável','Interesse em desenvolver a conta','Outro')),
 notes text check(length(notes)<=5000),status text not null default 'pending' check(status in('pending','approved','rejected','cancelled')),
 reviewed_by uuid references public.profiles(id) on delete restrict,reviewed_by_name text,
 review_notes text check(length(review_notes)<=5000),reviewed_at timestamptz,created_at timestamptz not null default now()
);
create unique index company_assignment_requests_one_pending on public.company_assignment_requests(company_id) where status='pending';
create index company_assignment_requests_user_idx on public.company_assignment_requests(requested_by,created_at desc);
create index company_assignment_requests_review_idx on public.company_assignment_requests(reviewed_by);
create index company_assignment_requests_previous_idx on public.company_assignment_requests(previous_owner_id);

create table public.company_portfolio_notifications (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete restrict,
 company_id uuid references public.companies(id) on delete restrict,kind text not null,
 message text not null,dedupe_key text not null,read_at timestamptz,created_at timestamptz not null default now(),
 unique(user_id,dedupe_key)
);
create index company_portfolio_notifications_user_idx on public.company_portfolio_notifications(user_id,created_at desc);
create index company_portfolio_notifications_company_idx on public.company_portfolio_notifications(company_id);

alter table public.company_portfolio_history enable row level security;
alter table public.company_assignment_requests enable row level security;
alter table public.company_portfolio_notifications enable row level security;
revoke all on public.company_portfolio_history,public.company_assignment_requests,public.company_portfolio_notifications from public,anon,authenticated;
grant select on public.company_portfolio_history,public.company_assignment_requests,public.company_portfolio_notifications to authenticated;
grant all on public.company_portfolio_history,public.company_assignment_requests,public.company_portfolio_notifications to service_role;

create function private.b2b_manager() returns boolean
language sql stable security invoker set search_path = '' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and active and role='gerente');
$$;
revoke all on function private.b2b_manager() from public,anon;
grant usage on schema private to authenticated,service_role;
grant execute on function private.b2b_manager() to authenticated,service_role;

create policy b2b_history_read on public.company_portfolio_history for select to authenticated
 using(private.b2b_manager() or exists(select 1 from public.companies c where c.id=company_id));
create policy b2b_requests_read on public.company_assignment_requests for select to authenticated
 using(private.b2b_manager() or requested_by=(select auth.uid()));
create policy b2b_notifications_read on public.company_portfolio_notifications for select to authenticated
 using(user_id=(select auth.uid()) and exists(select 1 from public.profiles where id=(select auth.uid()) and active));

create function private.b2b_name(p_id uuid) returns text
language sql stable security invoker set search_path = '' as $$
 select case when nullif(btrim(consultant_tag),'') is null then full_name
   when consultant_tag ~ '^[a-z0-9_-]+$' then initcap(regexp_replace(consultant_tag,'[-_]+',' ','g'))
   else btrim(consultant_tag) end from public.profiles where id=p_id;
$$;
revoke all on function private.b2b_name(uuid) from public,anon;
grant execute on function private.b2b_name(uuid) to authenticated,service_role;

create function private.b2b_notify(p_user uuid,p_company uuid,p_kind text,p_message text,p_key text) returns void
language sql security definer set search_path = '' as $$
 insert into public.company_portfolio_notifications(user_id,company_id,kind,message,dedupe_key)
 select p_user,p_company,p_kind,p_message,p_key where p_user is not null
 on conflict(user_id,dedupe_key) do nothing;
$$;
revoke all on function private.b2b_notify(uuid,uuid,text,text,text) from public,anon,authenticated;

create function private.b2b_audit(p_company uuid,p_kind text,p_old jsonb,p_new jsonb,p_reason text,p_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
 insert into public.company_portfolio_history(company_id,kind,previous_value,new_value,reason,notes,changed_by,changed_by_name)
 values(p_company,p_kind,p_old,p_new,p_reason,p_notes,auth.uid(),coalesce(private.b2b_name(auth.uid()),'Rotina automática')) returning id into v_id;
 return v_id;
end $$;
revoke all on function private.b2b_audit(uuid,text,jsonb,jsonb,text,text) from public,anon,authenticated;

-- Existing rows are classified from real completed actions, not contact edits.
update public.companies c set relationship_status='active'
where c.owner_id is not null and exists(select 1 from public.b2b_last_valid_activity(c.id,(now() at time zone 'America/Sao_Paulo')::date) a
 where (public.b2b_commercial_cycle((now() at time zone 'America/Sao_Paulo')::date)->>'ordinal')::int
   - (public.b2b_commercial_cycle(a.action_date)->>'ordinal')::int < 2);
insert into public.company_portfolio_history(company_id,kind,new_value,reason,changed_by_name)
select id,'assignment',jsonb_build_object('owner_id',owner_id,'name',private.b2b_name(owner_id)),
 'Responsável preservado na implantação','Migração' from public.companies where owner_id is not null;
insert into public.company_portfolio_history(company_id,kind,previous_value,new_value,reason,changed_by_name)
select id,'assignment',jsonb_build_object('owner_id',null,'name',consultor),jsonb_build_object('owner_id',null,'name','Sem responsável'),
 'Vínculo legado preservado','Migração' from public.companies where owner_id is null and nullif(btrim(consultor),'') is not null;

-- Owners may edit their company, but only the commercial manager may transfer
-- it. Both row checks and column privileges prevent status/owner escalation.
drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies for update to authenticated
 using((select public.is_manager()) or owner_id=(select auth.uid()))
 with check((select public.is_manager()) or owner_id=(select auth.uid()));
create policy b2b_companies_active_actor on public.companies as restrictive for all to authenticated
 using(exists(select 1 from public.profiles where id=(select auth.uid()) and active))
 with check(exists(select 1 from public.profiles where id=(select auth.uid()) and active));
-- Keep the existing read directory ("De quem é?", High School, maps and event
-- participants). Portfolio screens themselves scope consultants to own/available.

revoke update on public.companies from authenticated;
do $$ declare cols text; begin
 select string_agg(quote_ident(column_name),',') into cols from information_schema.columns
 where table_schema='public' and table_name='companies' and column_name not in('relationship_status','relationship_changed_at');
 execute 'grant update ('||cols||') on public.companies to authenticated';
end $$;

create function private.b2b_guard_company() returns trigger
language plpgsql security definer set search_path = '' as $$
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
end $$;
revoke all on function private.b2b_guard_company() from public,anon,authenticated;
create trigger b2b_guard_company before insert or update on public.companies for each row execute function private.b2b_guard_company();

create function private.b2b_company_history() returns trigger
language plpgsql security definer set search_path = '' as $$
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
end $$;
revoke all on function private.b2b_company_history() from public,anon,authenticated;
create trigger b2b_company_history after insert or update on public.companies for each row execute function private.b2b_company_history();

-- Commercial activity identity is stamped from the session when entered in
-- the existing contact form. Other participants never take company ownership.
create function private.b2b_stamp_activity() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
 if new.meeting_type is null and auth.uid() is not null then
   new.primary_owner_id:=auth.uid();new.consultor:=private.b2b_name(auth.uid());
 end if;
 return new;
end $$;
revoke all on function private.b2b_stamp_activity() from public,anon;
grant execute on function private.b2b_stamp_activity() to authenticated,service_role;
create trigger b2b_stamp_activity before insert on public.activities for each row execute function private.b2b_stamp_activity();

create function private.b2b_activity_relationship() returns trigger
language plpgsql security definer set search_path = '' as $$
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
end $$;
revoke all on function private.b2b_activity_relationship() from public,anon,authenticated;
create trigger b2b_activity_relationship after insert or update of status,data,tipo on public.activities
 for each row execute function private.b2b_activity_relationship();
create trigger b2b_action_relationship after insert on public.company_actions
 for each row execute function private.b2b_activity_relationship();

-- Pending identities stay private. Other consultants only receive a boolean
-- so the opportunity UI can prevent duplicate requests before submitting.
create function private.b2b_has_pending(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and active)
   and exists(select 1 from public.company_assignment_requests where company_id=p_company and status='pending');
$$;
revoke all on function private.b2b_has_pending(uuid) from public,anon;
grant execute on function private.b2b_has_pending(uuid) to authenticated,service_role;

-- Derived data is never stored on companies. A missed cron does not show an
-- expired relationship as active; the review persists and audits transitions.
create view public.b2b_company_portfolio with(security_invoker=true) as
 with base as (
   select c.*,coalesce(nullif(c.nome_fantasia,''),c.razao_social) company_name,
     coalesce(private.b2b_name(c.owner_id),'Sem responsável') owner_name,
     coalesce(private.b2b_name(c.owner_id),
       (select h.previous_value->>'name' from public.company_portfolio_history h where h.company_id=c.id and h.kind='assignment'
         and nullif(h.previous_value->>'name','') is not null order by h.created_at desc,h.id desc limit 1),nullif(c.consultor,'')) last_owner_name,
     case when g.ativo and g.status<>'Encerrado' then 'Conveniada'
       when g.status='Encerrado' or c.etapa in('Perdida','Sem potencial') then 'Não conveniada'
       when c.etapa in('Novo','Mapeada') then 'Mapeada' else 'Em negociação' end agreement_status,
     a.id last_action_id,a.source last_action_source,a.action_type last_action_type,a.action_date last_action_date,
     a.user_name last_action_user,public.b2b_commercial_cycle(a.action_date) last_action_cycle,
     public.b2b_commercial_cycle((now() at time zone 'America/Sao_Paulo')::date) current_cycle,
     private.b2b_has_pending(c.id) pending_request,
     coalesce((select s.b2b_risk_days from public.app_settings s where s.id=1),30) risk_days,
     coalesce((select s.b2b_critical_days from public.app_settings s where s.id=1),15) critical_days
   from public.companies c left join public.agreements g on g.company_id=c.id
   left join lateral public.b2b_last_valid_activity(c.id,(now() at time zone 'America/Sao_Paulo')::date) a on true
 ), state as (
   select base.*,case when owner_id is not null and relationship_status='active' and last_action_date is not null
     and (current_cycle->>'ordinal')::int-(last_action_cycle->>'ordinal')::int<2 then 'active' else 'inactive' end effective_relationship,
     coalesce(last_action_cycle->>'code'=current_cycle->>'code',false) has_action_current_cycle,
     (current_cycle->>'end')::date-(now() at time zone 'America/Sao_Paulo')::date days_to_cycle_end,
     (data_proxima_acao>=(now() at time zone 'America/Sao_Paulo')::date and nullif(btrim(proxima_acao),'') is not null)
       or exists(select 1 from public.activities m where m.company_id=base.id and m.meeting_type is not null
         and m.status in('agendada','confirmada','reagendamento_solicitado') and m.end_at>now()) has_next_action
   from base
 ) select state.*,case when effective_relationship='inactive' then 'Sem relacionamento'
   when has_action_current_cycle then 'Saudável' when days_to_cycle_end<=critical_days then 'Crítico'
   else 'Atenção' end relationship_health,
   (effective_relationship='active' and not has_action_current_cycle and days_to_cycle_end<=risk_days) at_risk,
   case when effective_relationship='inactive' then 3 when not has_action_current_cycle and days_to_cycle_end<=critical_days then 0
     when not has_action_current_cycle and days_to_cycle_end<=risk_days then 1 when not has_action_current_cycle then 2
     when not has_next_action then 4 else 5 end priority,
   case when last_action_date is null then null else (now() at time zone 'America/Sao_Paulo')::date-last_action_date end days_since_action,
   case when effective_relationship='inactive' then (now() at time zone 'America/Sao_Paulo')::date-(relationship_changed_at at time zone 'America/Sao_Paulo')::date end days_inactive
 from state;
revoke all on public.b2b_company_portfolio from public,anon;
grant select on public.b2b_company_portfolio to authenticated,service_role;

create function private.b2b_review_companies(p_day date) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
end $$;
revoke all on function private.b2b_review_companies(date) from public,anon,authenticated;

create function public.b2b_review_portfolio() returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
 if auth.uid() is null then
   if current_user<>'service_role' then raise exception 'Não autenticado.'; end if;
 elsif not exists(select 1 from public.profiles where id=auth.uid() and active) then raise exception 'Acesso desativado.';
 end if;
 return private.b2b_review_companies((now() at time zone 'America/Sao_Paulo')::date);
end $$;
revoke all on function public.b2b_review_portfolio() from public,anon;
grant execute on function public.b2b_review_portfolio() to authenticated,service_role;
grant execute on function private.b2b_review_companies(date) to service_role;
-- Only this authenticated entry point delegates to the internal reviewer.
create function private.b2b_review_authenticated() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and active) then raise exception 'Acesso desativado.'; end if;
 return private.b2b_review_companies((now() at time zone 'America/Sao_Paulo')::date);
end $$;
revoke all on function private.b2b_review_authenticated() from public,anon;
grant execute on function private.b2b_review_authenticated() to authenticated;
create or replace function public.b2b_review_portfolio() returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
 if current_user='service_role' then return private.b2b_review_companies((now() at time zone 'America/Sao_Paulo')::date); end if;
 return private.b2b_review_authenticated();
end $$;

-- One transactional endpoint handles assignments and request lifecycle. It
-- validates canonical profiles, never JWT user_metadata or client identity.
create function private.b2b_portfolio_command(p_command text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
end $$;
revoke all on function private.b2b_portfolio_command(text,jsonb) from public,anon;
grant execute on function private.b2b_portfolio_command(text,jsonb) to authenticated;
create function public.b2b_portfolio_command(p_command text,p_payload jsonb) returns jsonb
language sql security invoker set search_path = '' as $$select private.b2b_portfolio_command(p_command,p_payload)$$;
revoke all on function public.b2b_portfolio_command(text,jsonb) from public,anon;
grant execute on function public.b2b_portfolio_command(text,jsonb) to authenticated;

-- Auto-provision the existing goals' cycle rows when needed; no manual annual
-- setup. Existing IDs and goals stay intact.
create function private.b2b_ensure_cycles() returns void
language plpgsql security definer set search_path = '' as $$
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
end $$;
revoke all on function private.b2b_ensure_cycles() from public,anon;
grant execute on function private.b2b_ensure_cycles() to authenticated;
create function public.b2b_ensure_cycles() returns void
language sql security invoker set search_path = '' as $$ select private.b2b_ensure_cycles() $$;
revoke all on function public.b2b_ensure_cycles() from public,anon;
grant execute on function public.b2b_ensure_cycles() to authenticated;

-- The account must be redistributed before access removal. No automatic
-- assignment clearing and no deletion of activity authors.
create function private.b2b_guard_departure() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if old.active and (not new.active or (new.role not in('gerente','supervisor','consultor_b2b','consultor'))) then
   if exists(select 1 from public.companies where owner_id=old.id) then
     raise exception 'Redistribua a carteira B2B antes de desativar ou alterar o perfil do consultor.';
   end if;
 end if;
 return new;
end $$;
revoke all on function private.b2b_guard_departure() from public,anon,authenticated;
create trigger b2b_guard_departure before update of active,role on public.profiles
 for each row execute function private.b2b_guard_departure();

create function private.b2b_guard_settings() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
 if (new.b2b_risk_days is distinct from old.b2b_risk_days or new.b2b_critical_days is distinct from old.b2b_critical_days)
   and not private.b2b_manager() then raise exception 'Somente o Gerente Comercial pode configurar alertas B2B.'; end if;
 return new;
end $$;
revoke all on function private.b2b_guard_settings() from public,anon;
grant execute on function private.b2b_guard_settings() to authenticated,service_role;
create trigger b2b_guard_settings before update on public.app_settings for each row execute function private.b2b_guard_settings();

create function private.b2b_guard_cycle() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare cycle jsonb;
begin
 cycle:=public.b2b_commercial_cycle(new.start_at);
 if new.start_at is distinct from (cycle->>'start')::date or new.end_at is distinct from (cycle->>'end')::date then
   raise exception 'Use o período automático do ciclo comercial (outubro–abril ou maio–setembro).';
 end if;
 new.name:=cycle->>'name';return new;
end $$;
revoke all on function private.b2b_guard_cycle() from public,anon;
grant execute on function private.b2b_guard_cycle() to authenticated,service_role;
create trigger b2b_guard_cycle before insert or update on public.commercial_cycles for each row execute function private.b2b_guard_cycle();

-- Canonical profiles must not be self-promoted through the existing profile
-- edit policy. Server admin actions keep their existing role checks.
create function private.b2b_guard_profile_privileges() returns trigger
language plpgsql security invoker set search_path = '' as $$
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
end $$;
revoke all on function private.b2b_guard_profile_privileges() from public,anon;
grant execute on function private.b2b_guard_profile_privileges() to authenticated,service_role;
create trigger b2b_guard_profile_privileges before insert or update on public.profiles
 for each row execute function private.b2b_guard_profile_privileges();

create index activities_b2b_completed_idx on public.activities(company_id,data desc,created_at desc) where status='realizada';
create view public.b2b_activities_with_cycle with(security_invoker=true) as
 select a.*,public.b2b_commercial_cycle(a.data) commercial_cycle from public.activities a;
create view public.b2b_actions_with_cycle with(security_invoker=true) as
 select a.*,public.b2b_commercial_cycle((a.occurred_at at time zone 'America/Sao_Paulo')::date) commercial_cycle from public.company_actions a;
revoke all on public.b2b_activities_with_cycle,public.b2b_actions_with_cycle from public,anon;
grant select on public.b2b_activities_with_cycle,public.b2b_actions_with_cycle to authenticated,service_role;
