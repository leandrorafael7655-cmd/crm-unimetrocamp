/* ─────────────────────────  regras de pipeline (puras)  ─────────────────────────
   Lógica de negócio sem estado nem React: situação do link de inscrição, saúde
   do convênio e a fila de prioridade do dia. Extraída de components/crm-app.jsx
   preservando o comportamento; a suíte pipeline.test.ts fixa as regras. */

import { ETAPAS_ENCERRADAS, ETAPAS_CONVENIO, CLASSES } from "./constants"
import { diffDias, num, meses } from "./utils"

export interface Convenio {
  ativo?: boolean
  status?: string
  dataInicio?: string
  ultimaDivulgacao?: string
  matriculasAcademicas?: string | number
  [k: string]: unknown
}

export interface Empresa {
  id: string
  classificacao?: string
  etapa?: string
  convenio?: Convenio | null
  dataProximaAcao?: string
  ultimoContato?: string
  linkInscricao?: string
  linkConsultor?: string
  consultor?: string
  [k: string]: unknown
}

export type Nivel = "critico" | "hoje" | "atencao"

export interface ItemFila {
  empresa: Empresa
  motivos: string[]
  peso: number
  nivel: Nivel
}

export interface SaudeConvenio {
  rotulo: string
  nivel: "pendente" | "encerrado" | "alerta" | "vazio" | "novo" | "ok"
  idade: number | null
}

/* ─── link de inscrição ───
   O link é do par consultor × empresa. Se a empresa troca de dono, o link do
   antigo consultor fica "defasado" e não pode ser divulgado até o novo refazer. */
export const linkDaEmpresa = (empresa: Empresa | null | undefined): string =>
  empresa && empresa.linkInscricao ? empresa.linkInscricao.trim() : ""

export const linkDefasado = (empresa: Empresa | null | undefined): boolean =>
  Boolean(
    linkDaEmpresa(empresa) &&
      empresa?.linkConsultor &&
      empresa.linkConsultor !== empresa.consultor,
  )

/* o único link que pode ser copiado e divulgado */
export const linkAtivo = (empresa: Empresa | null | undefined): string =>
  linkDefasado(empresa) ? "" : linkDaEmpresa(empresa)

/* ─── saúde do convênio ───
   Sem vencimento: o que importa é se ele gera aluno. */
export function saudeConvenio(empresa: Empresa, hoje: string): SaudeConvenio {
  const cv = empresa.convenio
  if (!cv || !cv.ativo) return { rotulo: "Não cadastrado", nivel: "pendente", idade: null }
  if (cv.status === "Encerrado") return { rotulo: "Encerrado", nivel: "encerrado", idade: null }
  if (cv.status === "Suspenso") return { rotulo: "Suspenso", nivel: "alerta", idade: null }
  const idade = cv.dataInicio ? diffDias(cv.dataInicio, hoje) : null
  const mat = num(cv.matriculasAcademicas)
  const semDivulgar = cv.ultimaDivulgacao ? diffDias(cv.ultimaDivulgacao, hoje) : null
  if (mat === 0 && idade !== null && idade > 90) return { rotulo: "Sem matrícula", nivel: "vazio", idade }
  if (mat === 0) return { rotulo: "Recém-assinado", nivel: "novo", idade }
  if (semDivulgar !== null && semDivulgar > 120) return { rotulo: "Sem divulgar", nivel: "alerta", idade }
  if (semDivulgar === null) return { rotulo: "Ativo", nivel: "ok", idade }
  return { rotulo: "Ativo", nivel: "ok", idade }
}

/* ─── fila de prioridade do dia ───
   Cada empresa vira, no máximo, um item; múltiplos motivos se acumulam e o
   maior peso define o nível/urgência. Ordenada por peso decrescente. */
export function construirFila(empresas: Empresa[], hoje: string): ItemFila[] {
  const mapa = new Map<string, ItemFila>()
  const push = (e: Empresa, motivo: string, peso: number, nivel: Nivel) => {
    const atual = mapa.get(e.id)
    if (!atual) mapa.set(e.id, { empresa: e, motivos: [motivo], peso, nivel })
    else {
      atual.motivos.push(motivo)
      if (peso > atual.peso) {
        atual.peso = peso
        atual.nivel = nivel
      }
    }
  }
  empresas.forEach((e) => {
    if (["Sem potencial", "Inativa"].includes(e.classificacao || "")) return
    if (ETAPAS_ENCERRADAS.includes(e.etapa || "")) return

    const cv = e.convenio
    if (ETAPAS_CONVENIO.includes(e.etapa || "") && !linkAtivo(e)) {
      push(
        e,
        linkDefasado(e)
          ? `Link ainda é de ${e.linkConsultor} — cadastrar o seu e reavisar o RH`
          : "Conveniada sem link de inscrição — as matrículas não estão sendo atribuídas",
        250,
        "critico",
      )
    }
    if (cv && cv.ativo && cv.status === "Ativo") {
      const s = saudeConvenio(e, hoje)
      if (s.nivel === "vazio") push(e, `Convênio há ${meses(s.idade)} sem nenhuma matrícula`, 230, "critico")
      else if (s.nivel === "alerta") push(e, "Convênio ativo sem divulgação há mais de 4 meses", 150, "hoje")
    } else if (ETAPAS_CONVENIO.includes(e.etapa || "") && !(cv && cv.ativo)) {
      push(e, "Marcada como conveniada, mas sem convênio cadastrado", 170, "hoje")
    }

    if (e.dataProximaAcao) {
      const atraso = diffDias(e.dataProximaAcao, hoje)
      if (atraso !== null && atraso > 0)
        push(e, `Follow-up atrasado há ${atraso} ${atraso > 1 ? "dias" : "dia"}`, 200 + atraso, "critico")
      else if (atraso === 0) push(e, "Follow-up marcado para hoje", 160, "hoje")
    } else {
      push(e, "Sem próximo passo definido", 40, "atencao")
    }

    const limite = (CLASSES[e.classificacao as keyof typeof CLASSES] || CLASSES.Mapeada).limite
    const sem = diffDias(e.ultimoContato || "", hoje)
    if (sem !== null && sem > limite) {
      push(
        e,
        `${sem} dias sem contato`,
        e.classificacao === "Ouro" ? 180 : 70,
        e.classificacao === "Ouro" ? "critico" : "atencao",
      )
    }
    if (!e.ultimoContato) push(e, "Nunca contatada", 60, "atencao")
  })
  return [...mapa.values()].sort((a, b) => b.peso - a.peso)
}
