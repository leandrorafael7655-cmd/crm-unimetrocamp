-- ============================================================================
-- VERIFICAÇÃO DE SCHEMA — FASE 1 (Cron / fechamento semanal)
-- ============================================================================
-- Rodar no SQL Editor do Supabase de PRODUÇÃO. Somente leitura (SELECT).
-- Nenhuma consulta retorna dados de cliente: só metadados de schema, tipos,
-- nomes de constraint/índice e políticas de RLS.
--
-- Rode UM BLOCO POR VEZ e compare a saída com o "ESPERADO" do comentário.
-- Se qualquer bloco divergir do esperado, PARE e me avise antes de publicar.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- BLOCO 1 — Índice único (user_id, week_start) em weekly_action_snapshots
-- ----------------------------------------------------------------------------
-- POR QUÊ: o fechamento usa "ON CONFLICT (user_id, week_start) DO NOTHING"
--          para ser idempotente. Sem um índice/constraint ÚNICO nessas duas
--          colunas, o upsert falha e o cron quebra.
-- ESPERADO: pelo menos 1 linha, com indexdef contendo "UNIQUE" e as colunas
--           (user_id, week_start). O nome pode variar (ex.: uq_weekly_snapshot).
-- SE VIER VAZIO: falta o índice único → NÃO publicar; me avise.
select
  indexname                                   as nome_indice,
  indexdef                                    as definicao,
  (indexdef ilike '%unique%')                 as e_unico
from pg_indexes
where schemaname = 'public'
  and tablename  = 'weekly_action_snapshots'
  and indexdef ilike '%user_id%'
  and indexdef ilike '%week_start%';


-- ----------------------------------------------------------------------------
-- BLOCO 2 — Colunas applied_target e applicable em weekly_action_snapshots
-- ----------------------------------------------------------------------------
-- POR QUÊ: o fechamento grava applied_target (a meta CONGELADA da semana) e
--          applicable (se a semana conta para aderência). Tipos errados ou
--          coluna ausente corrompem o cálculo histórico.
-- ESPERADO: exatamente 2 linhas:
--             applied_target | integer | NO   (NOT NULL)
--             applicable     | boolean | NO   (NOT NULL)
-- SE FALTAR UMA, OU O TIPO DIFERIR: NÃO publicar; me avise.
select
  column_name  as coluna,
  data_type    as tipo,
  is_nullable  as aceita_nulo
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'weekly_action_snapshots'
  and column_name in ('applied_target', 'applicable')
order by column_name;


-- ----------------------------------------------------------------------------
-- BLOCO 3 — Existência da tabela goal_week_exceptions
-- ----------------------------------------------------------------------------
-- POR QUÊ: o fechamento respeita exceções de semana (feriado/recesso) para não
--          penalizar aderência. Se a tabela não existir, a leitura quebra.
-- ESPERADO: 1 linha, existe = true.
-- SE VIER false: a tabela não existe em produção → me avise antes de publicar.
select
  to_regclass('public.goal_week_exceptions') is not null as existe;


-- ----------------------------------------------------------------------------
-- BLOCO 4 — Colunas de goal_week_exceptions usadas pelo fechamento
-- ----------------------------------------------------------------------------
-- POR QUÊ: o código filtra por week_start e applicable=false para pular semanas.
-- ESPERADO: 2 linhas:
--             applicable | boolean
--             week_start | date
-- SE FALTAR ALGUMA: me avise (o schema de produção divergiu do de staging).
select
  column_name as coluna,
  data_type   as tipo
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'goal_week_exceptions'
  and column_name in ('week_start', 'applicable')
order by column_name;


-- ----------------------------------------------------------------------------
-- BLOCO 5 — RLS HABILITADA nas tabelas que a Fase 1 lê ou escreve
-- ----------------------------------------------------------------------------
-- POR QUÊ: o cron usa service_role (que ignora RLS por design), mas as MESMAS
--          tabelas são lidas pela aplicação com a sessão do usuário. RLS
--          precisa estar LIGADA para não vazar dado entre usuários.
-- TABELAS: weekly_action_snapshots (escrita), profiles, goals, activities,
--          goal_week_exceptions (leitura).
-- ESPERADO: 5 linhas, todas com rls_habilitada = true.
-- SE ALGUMA vier false: buraco de segurança → me avise antes de publicar.
select
  c.relname            as tabela,
  c.relrowsecurity     as rls_habilitada
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relkind = 'r'
  and c.relname in (
    'weekly_action_snapshots',
    'profiles',
    'goals',
    'activities',
    'goal_week_exceptions'
  )
order by c.relname;


-- ----------------------------------------------------------------------------
-- BLOCO 6 — Políticas de RLS existentes nessas mesmas 5 tabelas
-- ----------------------------------------------------------------------------
-- POR QUÊ: RLS ligada SEM política nenhuma bloqueia tudo (a app pararia de ler).
--          Este bloco lista o comando (SELECT/INSERT/...), os papéis a que a
--          política se aplica e se o filtro é aberto.
-- LER ASSIM:
--   • qual_aberto = true  → política com USING (true): revise se é intencional.
--   • roles = {public}    → aplica a qualquer papel; o esperado no projeto é
--                           {authenticated} (a Fase 3 vai corrigir isto — aqui
--                           é só para registrar o estado atual, não bloqueia).
-- ESPERADO: pelo menos 1 linha por tabela (cada tabela tem políticas).
-- SE ALGUMA das 5 tabelas NÃO aparecer: RLS ligada sem política → me avise.
select
  tablename                                   as tabela,
  policyname                                  as politica,
  cmd                                         as comando,
  roles::text                                 as papeis,
  (coalesce(qual, '') = 'true')               as qual_aberto,
  (coalesce(with_check, '') = 'true')         as check_aberto
from pg_policies
where schemaname = 'public'
  and tablename in (
    'weekly_action_snapshots',
    'profiles',
    'goals',
    'activities',
    'goal_week_exceptions'
  )
order by tablename, cmd, policyname;
