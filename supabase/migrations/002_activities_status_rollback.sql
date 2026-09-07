-- 002_activities_status_rollback.sql
-- Reverte 002_activities_status.sql. O backfill de primary_owner_id não é
-- desfeito individualmente — a coluna inteira é removida.

DROP INDEX IF EXISTS idx_activities_status;
DROP INDEX IF EXISTS idx_activities_company;
DROP INDEX IF EXISTS idx_activities_owner_data;

ALTER TABLE activities DROP COLUMN IF EXISTS updated_at;
ALTER TABLE activities DROP COLUMN IF EXISTS created_at;
ALTER TABLE activities DROP COLUMN IF EXISTS conta_meta_semanal;
ALTER TABLE activities DROP COLUMN IF EXISTS primary_owner_id;
ALTER TABLE activities DROP COLUMN IF EXISTS status;
