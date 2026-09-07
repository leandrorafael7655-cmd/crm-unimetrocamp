import type { Config, Convenio, Pessoa } from "./types"

/* ─────────────────────────  domínio  ───────────────────────── */

export const CHAVES = {
  empresas: "unimetrocamp:empresas",
  atividades: "unimetrocamp:atividades",
  equipe: "unimetrocamp:equipe",
  config: "unimetrocamp:config",
  usuario: "unimetrocamp:usuario",
} as const

export const ETAPAS = [
  "Mapeada",
  "Contato iniciado",
  "Decisor identificado",
  "Reunião agendada",
  "Diagnóstico realizado",
  "Proposta enviada",
  "Formalização",
  "Conveniada",
  "Relacionamento ativo",
]
export const ETAPAS_ENCERRADAS = ["Sem retorno", "Retomar futuramente", "Perdida", "Sem potencial"]
export const TODAS_ETAPAS = [...ETAPAS, ...ETAPAS_ENCERRADAS]
export const ETAPAS_CONVENIO = ["Conveniada", "Relacionamento ativo"]

export const CLASSES: Record<string, { chip: string; limite: number }> = {
  Ouro: { chip: "bg-amber-100 text-amber-900 border-amber-300", limite: 15 },
  Prata: { chip: "bg-slate-200 text-slate-800 border-slate-300", limite: 30 },
  Bronze: { chip: "bg-orange-100 text-orange-900 border-orange-300", limite: 30 },
  Mapeada: { chip: "bg-sky-50 text-sky-800 border-sky-200", limite: 45 },
  "Sem potencial": { chip: "bg-slate-100 text-slate-500 border-slate-200", limite: 999 },
  Inativa: { chip: "bg-slate-100 text-slate-500 border-slate-200", limite: 999 },
}

export const TIPOS_ATIVIDADE = [
  "Ligação",
  "WhatsApp",
  "E-mail",
  "Visita",
  "Reunião presencial",
  "Reunião on-line",
  "Apresentação de proposta",
  "Ação interna",
  "Feira ou evento",
  "Palestra",
  "Plantão comercial",
  "Divulgação",
  "Follow-up",
]

export const SEGMENTOS = [
  "Indústria",
  "Logística",
  "Saúde",
  "Varejo",
  "Tecnologia",
  "Construção",
  "Serviços",
  "Alimentos",
  "Educação",
  "Financeiro",
]
export const POTENCIAIS = ["Alto", "Médio", "Baixo"]
export const CARGOS_CONTATO = ["Decisor", "Influenciador", "RH", "Marketing", "Administrativo", "Diretoria", "Operacional"]
export const STATUS_CONVENIO = ["Ativo", "Suspenso", "Encerrado"]

export const EQUIPE_PADRAO: Pessoa[] = [
  { nome: "Gerência Comercial", papel: "Gerente", tag: "gerencia" },
  { nome: "Consultor 1", papel: "Consultor", tag: "consultor1" },
  { nome: "Consultor 2", papel: "Consultor", tag: "consultor2" },
]

/* Paleta institucional UniMetrocamp Wyden. */
export const MARCA_PADRAO = {
  nomeUnidade: "UniMetrocamp Wyden",
  corPrimaria: "#88005b", // magenta — ações, links, destaques
  corRail: "#00302b", // verde profundo — menu lateral e cabeçalhos escuros
  corSuave: "#b4fcf1", // menta — fundos leves, bordas suaves, texto sobre escuro
  corAlerta: "#ff1a00", // vermelho — crítico
  corAtencao: "#ffa21c", // âmbar — atenção, e a classificação Ouro
  logoUrl: "",
}

export const CONFIG_PADRAO: Config = {
  ...MARCA_PADRAO,
  linkBase: "",
  paramConsultor: "consultor",
  paramEmpresa: "empresa",
  incluirEmpresa: true,
  empresaChave: "cnpj",
  utm: true,
}

/* convênio sem prazo de validade: vigora enquanto não for encerrado */
export const CONVENIO_VAZIO: Convenio = {
  ativo: true,
  status: "Ativo",
  dataInicio: "",
  percentual: "",
  cursos: "",
  modalidades: "Presencial e EAD",
  dependentes: "Não",
  contrapartidas: "",
  responsavelAssinatura: "",
  contrato: "",
  ultimaDivulgacao: "",
  inscricoes: "",
  matriculasFinanceiras: "",
  matriculasAcademicas: "",
  observacoes: "",
}

export const CORES_SAUDE: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-800 border-emerald-200",
  novo: "bg-sky-50 text-sky-800 border-sky-200",
  alerta: "bg-amber-100 text-amber-900 border-amber-300",
  vazio: "bg-rose-100 text-rose-800 border-rose-300",
  pendente: "bg-slate-100 text-slate-600 border-slate-300",
  encerrado: "bg-slate-100 text-slate-500 border-slate-200",
}

/* EMPRESA_VAZIA é definida em seed.ts para evitar dependência circular com utils */
