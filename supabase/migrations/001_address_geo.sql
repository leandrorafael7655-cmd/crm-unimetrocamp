-- 001_address_geo.sql
-- Endereço estruturado e geolocalização para companies.
-- `cidade` e `bairro` PERMANECEM (já existem e estão populadas) — não são tocadas aqui.
-- Idempotente: pode ser reaplicada com segurança (IF NOT EXISTS).

ALTER TABLE companies ADD COLUMN IF NOT EXISTS logradouro         text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS numero             text;   -- texto: "s/n", "1200-A"
ALTER TABLE companies ADD COLUMN IF NOT EXISTS complemento        text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS cep                text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS latitude           double precision;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS longitude          double precision;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS geocoded_at        timestamptz;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS geocode_precision  text;

CREATE INDEX IF NOT EXISTS idx_companies_owner_id ON companies(owner_id);
CREATE INDEX IF NOT EXISTS idx_companies_etapa    ON companies(etapa);
CREATE INDEX IF NOT EXISTS idx_companies_cidade   ON companies(cidade);
CREATE INDEX IF NOT EXISTS idx_companies_geo      ON companies(latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
