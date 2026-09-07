-- 005: o CHECK de profiles.role só permitia os 3 papéis legados.
-- Amplia para os 4 canônicos, mantendo 'consultor' legado como aceito para
-- não quebrar linhas antigas (a app normaliza 'consultor' -> 'consultor_b2b'
-- na leitura via normalizeRole).

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY[
    'gerente'::text,
    'supervisor'::text,
    'consultor_b2b'::text,
    'high_school'::text,
    'consultor'::text  -- legado, tolerado
  ]));
