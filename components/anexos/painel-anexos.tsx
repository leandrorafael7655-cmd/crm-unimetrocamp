"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { Paperclip, Trash2, Download, Loader2, UploadCloud } from "lucide-react"
import { uploadAnexo, listarAnexos, removerAnexo, type Anexo } from "@/app/actions/attachments"

const MAX_MB = 10

function tamanhoLegivel(bytes: number | null): string {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function PainelAnexos({
  entityType,
  entityId,
  usuarioId,
  ehGestor = false,
}: {
  entityType: "company" | "activity" | "school" | "school_action"
  entityId: string
  usuarioId?: string
  ehGestor?: boolean
}) {
  const [anexos, setAnexos] = useState<Anexo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState("")
  const [enviando, startEnvio] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      setAnexos(await listarAnexos(entityType, entityId))
    } finally {
      setCarregando(false)
    }
  }, [entityType, entityId])

  useEffect(() => {
    if (entityId) void carregar()
  }, [entityId, carregar])

  const aoEscolher = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setErro("")
    if (file.size > MAX_MB * 1024 * 1024) {
      setErro(`Arquivo acima de ${MAX_MB} MB.`)
      if (inputRef.current) inputRef.current.value = ""
      return
    }
    const form = new FormData()
    form.set("entityType", entityType)
    form.set("entityId", entityId)
    form.set("file", file)
    startEnvio(async () => {
      const r = await uploadAnexo(form)
      if (!r.ok) setErro(r.message)
      else await carregar()
      if (inputRef.current) inputRef.current.value = ""
    })
  }

  const aoRemover = (a: Anexo) => {
    if (!confirm(`Remover "${a.fileName}"?`)) return
    startEnvio(async () => {
      const r = await removerAnexo(a.id)
      if (!r.ok) setErro(r.message)
      else setAnexos((prev) => prev.filter((x) => x.id !== a.id))
    })
  }

  const podeRemover = (a: Anexo) => ehGestor || (usuarioId && a.uploadedBy === usuarioId)

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <Paperclip className="h-4 w-4 text-slate-500" aria-hidden />
          Anexos
        </h3>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-[#88005b] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#6d0049]">
          {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <UploadCloud className="h-3.5 w-3.5" aria-hidden />}
          <span>Enviar arquivo</span>
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            onChange={aoEscolher}
            disabled={enviando || !entityId}
          />
        </label>
      </div>

      <p className="mb-2 text-[11px] text-slate-500">
        PDF, imagens, planilhas e documentos. Máx. {MAX_MB} MB por arquivo.
      </p>

      {erro && (
        <p role="alert" className="mb-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {erro}
        </p>
      )}

      {carregando ? (
        <p className="py-3 text-center text-xs text-slate-400">Carregando…</p>
      ) : anexos.length === 0 ? (
        <p className="py-3 text-center text-xs text-slate-400">Nenhum anexo ainda.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {anexos.map((a) => (
            <li key={a.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-slate-800" title={a.fileName}>{a.fileName}</p>
                <p className="font-mono text-[10px] text-slate-400">
                  {a.mimeType}{a.fileSize ? ` · ${tamanhoLegivel(a.fileSize)}` : ""}
                </p>
              </div>
              {a.url && (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-[#88005b]"
                  title="Abrir / baixar"
                >
                  <Download className="h-4 w-4" aria-hidden />
                  <span className="sr-only">Baixar {a.fileName}</span>
                </a>
              )}
              {podeRemover(a) && (
                <button
                  onClick={() => aoRemover(a)}
                  disabled={enviando}
                  className="rounded-md p-1.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed"
                  title="Remover"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  <span className="sr-only">Remover {a.fileName}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
