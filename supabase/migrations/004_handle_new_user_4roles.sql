-- 004: handle_new_user aceita os 4 papéis canônicos.
-- gerente NUNCA é concedido pelo trigger (só server actions via service role).
-- Valor legado 'consultor' é mapeado para 'consultor_b2b'.
-- CREATE OR REPLACE idempotente; não altera dados existentes.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role text;
  v_name text;
  v_tag  text;
begin
  v_role := lower(coalesce(nullif(meta->>'role', ''), 'consultor_b2b'));
  if v_role = 'consultor' then
    v_role := 'consultor_b2b';
  end if;
  if v_role not in ('supervisor', 'consultor_b2b', 'high_school') then
    v_role := 'consultor_b2b';
  end if;

  v_name := coalesce(nullif(meta->>'full_name', ''), split_part(new.email, '@', 1));

  v_tag := nullif(meta->>'consultant_tag', '');
  if v_tag is null then
    v_tag := trim(both '-' from lower(regexp_replace(
      translate(v_name,
        'àáâãäçèéêëìíîïñòóôõöùúûüýÀÁÂÃÄÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ',
        'aaaaaceeeeiiiinooooouuuuyAAAAACEEEEIIIINOOOOOUUUUY'),
      '[^a-zA-Z0-9]+', '-', 'g')));
  end if;

  insert into public.profiles (id, full_name, email, role, consultant_tag, active)
  values (new.id, v_name, new.email, v_role, v_tag, true)
  on conflict (id) do nothing;

  return new;
exception when others then
  raise warning '[handle_new_user] falhou para % (%): %', new.id, new.email, sqlerrm;
  return new;
end;
$function$;
