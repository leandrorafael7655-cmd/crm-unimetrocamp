/* ─────────────────────────  tipos de domínio  ─────────────────────────
   Os objetos de domínio usam camelCase em português (iguais ao protótipo
   original). O mapeamento para colunas snake_case do banco fica isolado na
   camada de persistência (lib/data). */

export interface Contato {
  id: string
  nome: string
  papel?: string
  cargo?: string
  telefone?: string
  email?: string
}

export interface Convenio {
  ativo: boolean
  status: string
  dataInicio: string
  percentual: string | number
  cursos: string
  modalidades: string
  dependentes: string
  contrapartidas: string
  responsavelAssinatura: string
  contrato: string
  ultimaDivulgacao: string
  inscricoes: string | number
  matriculasFinanceiras: string | number
  matriculasAcademicas: string | number
  observacoes: string
}

export interface Empresa {
  id: string
  razaoSocial: string
  nomeFantasia: string
  cnpj: string
  segmento: string
  colaboradores: string | number
  cidade: string
  bairro: string
  telefone: string
  site: string
  origem: string
  classificacao: string
  etapa: string
  potencial: string
  possuiBeneficio: string
  observacoes: string
  consultor: string
  ownerId?: string | null
  /* endereço estruturado e geolocalização (migration 001) */
  logradouro?: string
  numero?: string
  complemento?: string
  cep?: string
  latitude?: number | null
  longitude?: number | null
  geocodedAt?: string
  geocodePrecision?: string
  ultimoContato: string
  proximaAcao: string
  dataProximaAcao: string
  dataEntrada: string
  linkInscricao: string
  linkConsultor: string
  contatos: Contato[]
  convenio: Convenio | null
}

export interface Atividade {
  id: string
  empresaId: string
  consultor: string
  data: string
  tipo: string
  contato: string
  resultado: string
  observacao: string
  leads: string | number
  impactados: string | number
  etapaAnterior: string
  etapaNova: string
  proximaAcao: string
  dataProximoContato: string
  /* status, posse e meta (migration 002) */
  status?: string
  primaryOwnerId?: string | null
  contaMetaSemanal?: boolean
}

export interface Pessoa {
  nome: string
  papel: string
  tag: string
  id?: string
  role?: string
  ativo?: boolean
}

export interface Config {
  nomeUnidade: string
  corPrimaria: string
  corRail: string
  corSuave: string
  corAlerta: string
  corAtencao: string
  logoUrl: string
  linkBase: string
  paramConsultor: string
  paramEmpresa: string
  incluirEmpresa: boolean
  empresaChave: string
  utm: boolean
}

export interface Usuario {
  id?: string
  nome: string
  papel: string
  tag: string
  email?: string
  role?: string
}
