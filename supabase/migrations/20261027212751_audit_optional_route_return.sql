begin;
-- The existing route form explicitly makes return optional. Preserve open routes.
alter table public.route_plans drop constraint route_plan_valid_interval;
alter table public.route_plans add constraint route_plan_valid_interval check(
  (departure_time is null or departure_time<'24:00'::time) and
  (return_time is null or (departure_time is not null and return_time>departure_time and return_time<'24:00'::time))) not valid;
alter table public.route_stops add constraint route_stop_nonnegative_order check(sort_order>=0) not valid;
alter table public.attendance_settings add constraint gdc_business_interval check(
  gdc_start is null or gdc_start between '09:00'::time and '19:00'::time) not valid;
commit;
