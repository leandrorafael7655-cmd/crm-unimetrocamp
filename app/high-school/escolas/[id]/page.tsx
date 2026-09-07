import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, MapPin, Phone, Mail, Globe } from "lucide-react"
import { getActor } from "@/lib/auth/guards"
import { can } from "@/lib/domain/roles"
import { getSchool360, listOwners, listGradeLevels } from "@/lib/data/high-school-queries"
import { Card, Chip, SectionTitle } from "@/components/high-school/hs-ui"
import { EscolaForm } from "@/components/high-school/escola-form"
import { ContatosPanel, EstimativasPanel, AcoesPanel } from "@/components/high-school/escola-360-panels"
import { CORES_ETAPA_HS } from "@/lib/domain/high-school"

export const dynamic = "force-dynamic"

function fmtDataHora(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export default async function Escola360Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [dados, actor, owners, grades] = await Promise.all([
    getSchool360(id),
    getActor(),
    listOwners(),
    listGradeLevels(),
  ])
  if (!dados) notFound()

  const podeEscrever = actor ? can(actor.role, "hs.write") : false
  const { escola, contatos, estimativas, acoes, historicoEtapa, historicoDono } = dados
  const nomeOwner = escola.primaryOwnerId ? owners.find((o) => o.id === escola.primaryOwnerId)?.nome : null
  const endereco = [escola.logradouro, escola.numero, escola.bairro, escola.cidade].filter(Boolean).join(", ")

  return (
    <>
      <Link href="/high-school/escolas" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand">
        <ArrowLeft className="h-4 w-4" /> Voltar às escolas
      </Link>

      {/* cabeçalho */}
      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-900 text-balance">{escola.nome}</h1>
              <Chip className={CORES_ETAPA_HS[escola.etapa]}>{escola.etapa}</Chip>
              {escola.classificacao && <Chip>{escola.classificacao}</Chip>}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {escola.rede}
              {escola.potencial ? ` · Potencial ${escola.potencial}` : ""}
              {nomeOwner ? ` · Resp. ${nomeOwner}` : " · Sem responsável"}
            </p>
          </div>
          {podeEscrever && (
            <EscolaForm owners={owners} escola={escola} variant="outline" />
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 text-sm text-slate-600 sm:grid-cols-2">
          {endereco && (
            <span className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-slate-400" /> {endereco}
            </span>
          )}
          {escola.telefone && (
            <span className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-slate-400" /> {escola.telefone}
            </span>
          )}
          {escola.email && (
            <span className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-slate-400" /> {escola.email}
            </span>
          )}
          {escola.site && (
            <span className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-slate-400" /> {escola.site}
            </span>
          )}
        </div>
        {escola.proximaAcao && (
          <div className="mt-3 rounded-lg bg-brand/5 px-3 py-2 text-sm text-slate-700">
            <span className="font-medium text-brand">Próximo passo:</span> {escola.proximaAcao}
            {escola.proximaAcaoEm ? ` (${escola.proximaAcaoEm.split("-").reverse().join("/")})` : ""}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <AcoesPanel escolaId={escola.id} acoes={acoes} grades={grades} owners={owners} podeEscrever={podeEscrever} />
          <EstimativasPanel escolaId={escola.id} estimativas={estimativas} grades={grades} podeEscrever={podeEscrever} />
        </div>

        <div className="space-y-6">
          <ContatosPanel escolaId={escola.id} contatos={contatos} podeEscrever={podeEscrever} />

          {/* histórico */}
          <Card className="p-4">
            <SectionTitle>Histórico de etapas</SectionTitle>
            {historicoEtapa.length === 0 ? (
              <p className="py-3 text-center text-xs text-slate-400">Sem histórico.</p>
            ) : (
              <ol className="space-y-2.5">
                {historicoEtapa.map((h) => (
                  <li key={h.id} className="relative pl-4 text-xs">
                    <span className="absolute left-0 top-1 h-2 w-2 rounded-full bg-brand" />
                    <p className="text-slate-700">
                      {h.anterior ? `${h.anterior} → ` : ""}
                      <span className="font-medium">{h.nova}</span>
                    </p>
                    <p className="text-slate-400">
                      {fmtDataHora(h.quando)}
                      {h.quem ? ` · ${h.quem}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
            {historicoDono.length > 0 && (
              <>
                <div className="my-3 border-t border-slate-100" />
                <p className="mb-2 text-xs font-semibold text-slate-500">Mudanças de responsável</p>
                <ol className="space-y-2">
                  {historicoDono.map((h) => (
                    <li key={h.id} className="pl-4 text-xs text-slate-500">
                      {(h.anterior ?? "—") + " → " + (h.novo ?? "—")}
                      <span className="text-slate-400"> · {fmtDataHora(h.quando)}</span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
