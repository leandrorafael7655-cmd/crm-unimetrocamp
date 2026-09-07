"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { X } from "lucide-react"
import { upsertSchool } from "@/app/actions/high-school"
import { REDES_ESCOLA, ETAPAS_HS, ETAPAS_HS_COMPLEMENTARES, POTENCIAIS_HS, CLASSIFICACOES_HS, type Escola } from "@/lib/domain/high-school"
import type { OwnerOption } from "@/lib/data/high-school-queries"

const inputCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand/30"
const labelCls = "mb-1 block text-xs font-medium text-slate-600"

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  )
}

export function EscolaForm({
  owners,
  escola,
  variant = "primary",
}: {
  owners: OwnerOption[]
  escola?: Escola
  /** primary = botão magenta "Nova escola"; outline = botão discreto "Editar escola". */
  variant?: "primary" | "outline"
}) {
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState("")
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const edicao = Boolean(escola?.id)

  function abrir() {
    setErro("")
    setAberto(true)
  }

  function enviar(form: FormData) {
    setErro("")
    startTransition(async () => {
      const res = await upsertSchool(form)
      if (!res.ok) {
        setErro(res.message)
        return
      }
      setAberto(false)
      router.refresh()
      if (!edicao && res.id) router.push(`/high-school/escolas/${res.id}`)
    })
  }

  return (
    <>
      {variant === "outline" ? (
        <button
          onClick={abrir}
          className="rounded-md border border-slate-300 px-3.5 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          {edicao ? "Editar escola" : "Nova escola"}
        </button>
      ) : (
        <button
          onClick={abrir}
          className="rounded-md bg-brand px-3.5 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          {edicao ? "Editar" : "Nova escola"}
        </button>
      )}

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-8 w-full max-w-2xl rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <h2 className="text-sm font-semibold text-slate-800">
                {edicao ? "Editar escola" : "Nova escola"}
              </h2>
              <button onClick={() => setAberto(false)} className="text-slate-400 hover:text-slate-700" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form action={enviar} className="max-h-[70vh] overflow-y-auto px-5 py-4">
              {escola?.id && <input type="hidden" name="id" value={escola.id} />}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Campo label="Nome da escola *">
                    <input name="nome" defaultValue={escola?.nome} required className={inputCls} />
                  </Campo>
                </div>
                <Campo label="Rede">
                  <select name="rede" defaultValue={escola?.rede ?? "Outra"} className={inputCls}>
                    {REDES_ESCOLA.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Responsável">
                  <select name="ownerId" defaultValue={escola?.primaryOwnerId ?? ""} className={inputCls}>
                    <option value="">— Sem responsável —</option>
                    {owners.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nome}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Código INEP (opcional)">
                  <input name="inep" defaultValue={escola?.inep ?? ""} className={inputCls} />
                </Campo>
                <Campo label="CNPJ (opcional)">
                  <input name="cnpj" defaultValue={escola?.cnpj ?? ""} className={inputCls} />
                </Campo>
                <Campo label="Cidade">
                  <input name="cidade" defaultValue={escola?.cidade} className={inputCls} />
                </Campo>
                <Campo label="Bairro">
                  <input name="bairro" defaultValue={escola?.bairro} className={inputCls} />
                </Campo>
                <Campo label="Logradouro">
                  <input name="logradouro" defaultValue={escola?.logradouro} className={inputCls} />
                </Campo>
                <div className="grid grid-cols-2 gap-3">
                  <Campo label="Número">
                    <input name="numero" defaultValue={escola?.numero} className={inputCls} />
                  </Campo>
                  <Campo label="CEP">
                    <input name="cep" defaultValue={escola?.cep} className={inputCls} />
                  </Campo>
                </div>
                <Campo label="Complemento">
                  <input name="complemento" defaultValue={escola?.complemento} className={inputCls} />
                </Campo>
                <Campo label="Telefone">
                  <input name="telefone" defaultValue={escola?.telefone} className={inputCls} />
                </Campo>
                <Campo label="E-mail">
                  <input name="email" type="email" defaultValue={escola?.email} className={inputCls} />
                </Campo>
                <Campo label="Site">
                  <input name="site" defaultValue={escola?.site} className={inputCls} />
                </Campo>
                <Campo label="Instagram">
                  <input name="instagram" defaultValue={escola?.instagram} className={inputCls} />
                </Campo>
                <Campo label="Etapa do relacionamento">
                  <select name="etapa" defaultValue={escola?.etapa ?? "Mapeada"} className={inputCls}>
                    <optgroup label="Pipeline">
                      {ETAPAS_HS.map((e) => (
                        <option key={e} value={e}>
                          {e}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Complementares">
                      {ETAPAS_HS_COMPLEMENTARES.map((e) => (
                        <option key={e} value={e}>
                          {e}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </Campo>
                <Campo label="Potencial">
                  <select name="potencial" defaultValue={escola?.potencial ?? ""} className={inputCls}>
                    <option value="">—</option>
                    {POTENCIAIS_HS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Classificação">
                  <select name="classificacao" defaultValue={escola?.classificacao ?? ""} className={inputCls}>
                    <option value="">—</option>
                    {CLASSIFICACOES_HS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Próxima ação (texto)">
                  <input name="proximaAcao" defaultValue={escola?.proximaAcao ?? ""} className={inputCls} />
                </Campo>
                <Campo label="Data da próxima ação">
                  <input name="proximaAcaoEm" type="date" defaultValue={escola?.proximaAcaoEm ?? ""} className={inputCls} />
                </Campo>
                <div className="sm:col-span-2">
                  <Campo label="Observações">
                    <textarea name="observacoes" defaultValue={escola?.observacoes} rows={3} className={inputCls} />
                  </Campo>
                </div>
              </div>

              {erro && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{erro}</p>}

              <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  className="rounded-md border border-slate-300 px-3.5 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {pending ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
