-- 006_routes_rollback.sql — desfaz 006_routes.sql
drop trigger if exists trg_route_plans_touch on public.route_plans;
drop function if exists public.touch_route_plan_updated_at();
drop table if exists public.route_stops cascade;
drop table if exists public.route_plans cascade;
