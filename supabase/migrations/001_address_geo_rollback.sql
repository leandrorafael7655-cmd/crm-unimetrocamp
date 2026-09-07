-- 001_address_geo_rollback.sql
-- Reverte 001_address_geo.sql. NÃO remove cidade/bairro (são anteriores a esta migração).
-- (O plano chamava este arquivo de "002_rollback.sql"; renomeado para evitar
--  colisão de numeração com a migração 002.)

DROP INDEX IF EXISTS idx_companies_geo;
DROP INDEX IF EXISTS idx_companies_cidade;
DROP INDEX IF EXISTS idx_companies_etapa;
DROP INDEX IF EXISTS idx_companies_owner_id;

ALTER TABLE companies DROP COLUMN IF EXISTS geocode_precision;
ALTER TABLE companies DROP COLUMN IF EXISTS geocoded_at;
ALTER TABLE companies DROP COLUMN IF EXISTS longitude;
ALTER TABLE companies DROP COLUMN IF EXISTS latitude;
ALTER TABLE companies DROP COLUMN IF EXISTS cep;
ALTER TABLE companies DROP COLUMN IF EXISTS complemento;
ALTER TABLE companies DROP COLUMN IF EXISTS numero;
ALTER TABLE companies DROP COLUMN IF EXISTS logradouro;
