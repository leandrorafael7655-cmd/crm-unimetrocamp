-- 003_attachments_rollback.sql
-- Reverte 003_attachments.sql. Remove apenas a tabela de metadados;
-- objetos já enviados ao bucket `crm-media` devem ser limpos à parte, se desejado.

DROP INDEX IF EXISTS idx_attachments_entity;
DROP TABLE IF EXISTS attachments;
