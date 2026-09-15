alter table public.route_plans
  add column if not exists route_name text;

alter table public.route_plans
  drop constraint if exists route_plans_route_name_length;

alter table public.route_plans
  add constraint route_plans_route_name_length
  check (
    route_name is null
    or char_length(trim(route_name)) between 1 and 120
  );
