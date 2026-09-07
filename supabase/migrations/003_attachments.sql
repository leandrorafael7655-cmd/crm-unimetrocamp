-- 003_attachments.sql
-- Tabela de anexos. Os arquivos vivem no bucket PRIVADO `crm-media`;
-- esta tabela guarda apenas metadados e o caminho no Storage.
-- Caminho padrão: {entity_type}/{entity_id}/{uuid}-{slug}.{ext}

CREATE TABLE IF NOT EXISTS attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  text NOT NULL CHECK (entity_type IN ('company','activity','school','school_action')),
  entity_id    uuid NOT NULL,
  storage_path text NOT NULL UNIQUE,
  file_name    text NOT NULL,
  mime_type    text NOT NULL,
  file_size    bigint,
  description  text,
  uploaded_by  uuid NOT NULL REFERENCES profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entity_type, entity_id);

-- RLS: leitura para qualquer autenticado; criação por quem envia (uploaded_by = auth.uid());
-- remoção pelo autor ou pela gestão. Espelha a matriz das demais tabelas.
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attachments_select ON attachments;
CREATE POLICY attachments_select ON attachments
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS attachments_insert ON attachments;
CREATE POLICY attachments_insert ON attachments
  FOR INSERT WITH CHECK (uploaded_by = auth.uid());

DROP POLICY IF EXISTS attachments_delete ON attachments;
CREATE POLICY attachments_delete ON attachments
  FOR DELETE USING (uploaded_by = auth.uid() OR public.is_manager());
