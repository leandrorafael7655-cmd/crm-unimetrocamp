"use server"

import { createClient } from "@/lib/supabase/server"
import { requireActor, isManagerRole } from "@/lib/auth/guards"

const BUCKET = "crm-media"
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const ENTIDADES = ["company", "activity", "school", "school_action"] as const
type Entidade = (typeof ENTIDADES)[number]

/* Lista branca de MIME: documentos e imagens comuns do dia a dia comercial.
   Nada de executáveis/HTML — evita upload de conteúdo ativo no bucket. */
const MIME_PERMITIDOS = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv", "text/plain",
])

export interface Anexo {
  id: string
  entityType: string
  entityId: string
  storagePath: string
  fileName: string
  mimeType: string
  fileSize: number | null
  description: string | null
  uploadedBy: string
  createdAt: string
  url?: string
}

export interface AnexoResult {
  ok: boolean
  message: string
  anexo?: Anexo
}

function slugNome(nome: string): string {
  const ponto = nome.lastIndexOf(".")
  const base = (ponto > 0 ? nome.slice(0, ponto) : nome)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60)
  const ext = ponto > 0 ? nome.slice(ponto + 1).toLowerCase().replace(/[^a-z0-9]+/g, "") : ""
  return ext ? `${base || "arquivo"}.${ext}` : (base || "arquivo")
}

function validarEntidade(t: string): t is Entidade {
  return (ENTIDADES as readonly string[]).includes(t)
}

/** Faz upload de um arquivo e registra o metadado. Escopo por RLS (auth.uid()). */
export async function uploadAnexo(form: FormData): Promise<AnexoResult> {
  try {
    const actor = await requireActor()
    const entityType = String(form.get("entityType") ?? "")
    const entityId = String(form.get("entityId") ?? "")
    const description = (form.get("description") ? String(form.get("description")) : "").slice(0, 300)
    const file = form.get("file")

    if (!validarEntidade(entityType)) return { ok: false, message: "Tipo de entidade inválido." }
    if (!entityId) return { ok: false, message: "Registro de destino não informado." }
    if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Selecione um arquivo." }
    if (file.size > MAX_BYTES) return { ok: false, message: "Arquivo acima do limite de 10 MB." }
    if (!MIME_PERMITIDOS.has(file.type)) return { ok: false, message: "Tipo de arquivo não permitido." }

    const supabase = await createClient()
    const nome = slugNome(file.name)
    const path = `${entityType}/${entityId}/${crypto.randomUUID()}-${nome}`

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false })
    if (upErr) return { ok: false, message: `Falha no upload: ${upErr.message}` }

    const { data: row, error: insErr } = await supabase
      .from("attachments")
      .insert({
        entity_type: entityType,
        entity_id: entityId,
        storage_path: path,
        file_name: file.name.slice(0, 200),
        mime_type: file.type,
        file_size: file.size,
        description: description || null,
        uploaded_by: actor.id,
      })
      .select("id, entity_type, entity_id, storage_path, file_name, mime_type, file_size, description, uploaded_by, created_at")
      .single()

    if (insErr || !row) {
      // rollback do objeto órfão se o metadado falhar
      await supabase.storage.from(BUCKET).remove([path])
      return { ok: false, message: `Falha ao registrar anexo: ${insErr?.message ?? "desconhecido"}` }
    }

    return { ok: true, message: "Anexo enviado.", anexo: mapRow(row) }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro inesperado." }
  }
}

/** Lista anexos de um registro, com URL assinada de curta duração para cada um. */
export async function listarAnexos(entityType: string, entityId: string): Promise<Anexo[]> {
  await requireActor()
  if (!validarEntidade(entityType) || !entityId) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("attachments")
    .select("id, entity_type, entity_id, storage_path, file_name, mime_type, file_size, description, uploaded_by, created_at")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })

  if (error || !data) return []

  const anexos = data.map(mapRow)
  // URLs assinadas expiram em 5 min: o bucket é privado, nada é público.
  await Promise.all(
    anexos.map(async (a) => {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(a.storagePath, 300)
      a.url = signed?.signedUrl
    }),
  )
  return anexos
}

/** Remove um anexo (autor ou gestão). Apaga o objeto e o metadado. */
export async function removerAnexo(id: string): Promise<AnexoResult> {
  try {
    const actor = await requireActor()
    if (!id) return { ok: false, message: "Anexo não informado." }

    const supabase = await createClient()
    const { data: row } = await supabase
      .from("attachments")
      .select("storage_path, uploaded_by")
      .eq("id", id)
      .maybeSingle()
    if (!row) return { ok: false, message: "Anexo não encontrado." }

    if (row.uploaded_by !== actor.id && !isManagerRole(actor.role)) {
      return { ok: false, message: "Sem permissão para remover este anexo." }
    }

    await supabase.storage.from(BUCKET).remove([row.storage_path])
    const { error } = await supabase.from("attachments").delete().eq("id", id)
    if (error) return { ok: false, message: `Falha ao remover: ${error.message}` }
    return { ok: true, message: "Anexo removido." }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro inesperado." }
  }
}

function mapRow(r: Record<string, unknown>): Anexo {
  return {
    id: String(r.id),
    entityType: String(r.entity_type),
    entityId: String(r.entity_id),
    storagePath: String(r.storage_path),
    fileName: String(r.file_name),
    mimeType: String(r.mime_type),
    fileSize: r.file_size == null ? null : Number(r.file_size),
    description: r.description == null ? null : String(r.description),
    uploadedBy: String(r.uploaded_by),
    createdAt: String(r.created_at),
  }
}
