alter table public.profiles
  drop column if exists home_logradouro,
  drop column if exists home_numero,
  drop column if exists home_complemento,
  drop column if exists home_bairro,
  drop column if exists home_cidade,
  drop column if exists home_cep,
  drop column if exists home_latitude,
  drop column if exists home_longitude,
  drop column if exists home_geocoded_at;

create table if not exists public.route_user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  home_logradouro text,
  home_numero text,
  home_complemento text,
  home_bairro text,
  home_cidade text,
  home_cep text,
  home_latitude double precision,
  home_longitude double precision,
  home_geocoded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.route_user_preferences enable row level security;

drop policy if exists route_user_preferences_select_own on public.route_user_preferences;
create policy route_user_preferences_select_own
on public.route_user_preferences for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists route_user_preferences_insert_own on public.route_user_preferences;
create policy route_user_preferences_insert_own
on public.route_user_preferences for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists route_user_preferences_update_own on public.route_user_preferences;
create policy route_user_preferences_update_own
on public.route_user_preferences for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists route_user_preferences_delete_own on public.route_user_preferences;
create policy route_user_preferences_delete_own
on public.route_user_preferences for delete to authenticated
using (user_id = (select auth.uid()));

comment on table public.route_user_preferences is 'Preferências pessoais do planejador de rotas; endereço residencial é privado e visível apenas ao próprio usuário.';
