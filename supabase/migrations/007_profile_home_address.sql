alter table public.profiles
  add column if not exists home_logradouro text,
  add column if not exists home_numero text,
  add column if not exists home_complemento text,
  add column if not exists home_bairro text,
  add column if not exists home_cidade text,
  add column if not exists home_cep text,
  add column if not exists home_latitude double precision,
  add column if not exists home_longitude double precision,
  add column if not exists home_geocoded_at timestamptz;

comment on column public.profiles.home_logradouro is 'Endereço residencial opcional usado apenas como origem/destino no planejador de rotas.';
comment on column public.profiles.home_latitude is 'Latitude geocodificada do endereço residencial do próprio usuário.';
comment on column public.profiles.home_longitude is 'Longitude geocodificada do endereço residencial do próprio usuário.';
