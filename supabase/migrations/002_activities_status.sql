-- 002_activities_status.sql
-- Atividades ganham status, posse e sinalização de meta.
-- Idempotente (IF NOT EXISTS).

ALTER TABLE activities ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'realizada';
ALTER TABLE activities ADD COLUMN IF NOT EXISTS primary_owner_id uuid REFERENCES profiles(id);
ALTER TABLE activities ADD COLUMN IF NOT EXISTS conta_meta_semanal boolean NOT NULL DEFAULT true;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE activities ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- DEFAULT 'realizada' é deliberado e retroativo: toda atividade já existente
-- representa um contato que aconteceu. 'planejada' zeraria a Aderência de Campo
-- histórica de forma incorreta.

-- Backfill de posse por nome. NÃO inventa dono quando o nome não casa.
UPDATE activities a SET primary_owner_id = p.id
FROM profiles p WHERE p.full_name = a.consultor AND a.primary_owner_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_activities_owner_data ON activities(primary_owner_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_activities_company    ON activities(company_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_activities_status     ON activities(status);

-- Após aplicar, REPORTE (não corrija automaticamente):
--   SELECT count(*) FROM activities WHERE primary_owner_id IS NULL;
--   SELECT DISTINCT consultor FROM activities WHERE primary_owner_id IS NULL;
