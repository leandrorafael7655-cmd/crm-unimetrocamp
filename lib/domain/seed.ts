/* ─────────────────────────  dados de exemplo (demo)  ─────────────────────────
   Carteira fictícia da região de Campinas usada APENAS no modo demonstração.
   Nunca é chamada no modo Supabase/produção — a UI só expõe o botão de semear
   quando `modo === "demo"`. Extraída de components/crm-app.jsx sem alterar os
   dados, para manter o componente enxuto e o fixture testável. */

import { CONVENIO_VAZIO } from "./constants"
import { uid, completarCNPJ, slug, somarDias, hojeISO } from "./utils"

interface MembroEquipe {
  nome: string
  papel: string
  tag?: string
}

/* especificação compacta do convênio de cada empresa semeada */
interface EspecConvenio {
  ini: number
  pct: number
  insc: number
  mf: number
  ma: number
  div: number | null
  lk: number
}

type LinhaExemplo = [
  string, // razão social
  string, // nome fantasia
  string, // base do CNPJ (12 dígitos)
  string, // segmento
  number, // colaboradores
  string, // cidade
  string, // classificação
  string, // etapa
  string, // potencial
  number | null, // dias desde o último contato
  number | null, // dias até a próxima ação
  EspecConvenio | null,
]

export function dadosExemplo(equipe: MembroEquipe[]): Record<string, unknown>[] {
  const consultores = equipe.filter((p) => p.papel === "Consultor").map((p) => p.nome)
  const c = (i: number) => consultores[i % consultores.length] || equipe[0].nome
  const h = hojeISO()
  const base: LinhaExemplo[] = [
    ["Aurora Componentes Automotivos", "Aurora Componentes", "112233440001", "Indústria", 480, "Sumaré", "Ouro", "Proposta enviada", "Alto", -3, 5, null],
    ["Vetor Transportes e Logística Ltda", "Vetor Logística", "223344550001", "Logística", 320, "Campinas", "Ouro", "Reunião agendada", "Alto", -1, 2, null],
    ["Hospital Santa Marina S.A.", "Santa Marina", "334455660001", "Saúde", 950, "Campinas", "Ouro", "Relacionamento ativo", "Alto", -18, -2, { ini: -400, pct: 30, insc: 62, mf: 41, ma: 38, div: -50, lk: 1 }],
    ["Supermercados Vila Nova Ltda", "Vila Nova", "445566770001", "Varejo", 610, "Hortolândia", "Prata", "Contato iniciado", "Médio", -12, 9, null],
    ["TechCamp Sistemas de Informação", "TechCamp", "556677880001", "Tecnologia", 140, "Campinas", "Prata", "Decisor identificado", "Médio", -6, 4, null],
    ["Construtora Ipê Amarelo Ltda", "Construtora Ipê", "667788990001", "Construção", 220, "Valinhos", "Bronze", "Contato iniciado", "Baixo", -41, null, null],
    ["Alimentos Sabiá Indústria", "Sabiá Alimentos", "778899000001", "Alimentos", 380, "Paulínia", "Prata", "Conveniada", "Alto", -9, 21, { ini: -240, pct: 20, insc: 0, mf: 0, ma: 0, div: null, lk: 0 }],
    ["Metalúrgica Bandeirantes S.A.", "Metalúrgica Bandeirantes", "889900110001", "Indústria", 720, "Indaiatuba", "Ouro", "Formalização", "Alto", -2, 3, null],
    ["Grupo Cambuí Serviços Empresariais", "Grupo Cambuí", "990011220001", "Serviços", 95, "Vinhedo", "Mapeada", "Mapeada", "Baixo", null, null, null],
    ["Rede Nova Era Farmácias", "Nova Era", "101112130001", "Varejo", 260, "Americana", "Bronze", "Relacionamento ativo", "Médio", -25, 12, { ini: -600, pct: 15, insc: 18, mf: 11, ma: 9, div: -140, lk: 1 }],
  ]
  return base.map((b, i) => {
    const spec = b[11]
    return {
      id: uid(),
      razaoSocial: b[0], nomeFantasia: b[1], cnpj: completarCNPJ(b[2]), segmento: b[3],
      colaboradores: String(b[4]), cidade: b[5], bairro: "", telefone: "(19) 3xxx-xxxx", site: "",
      origem: i % 3 === 0 ? "Indicação" : "Prospecção ativa",
      consultor: c(i), classificacao: b[6], etapa: b[7], potencial: b[8],
      possuiBeneficio: i % 4 === 0 ? "Tem com outra instituição" : "Não sei",
      observacoes: "", contatos: [],
      ultimoContato: b[9] === null ? "" : somarDias(h, b[9]),
      proximaAcao: b[10] === null ? "" : "Retomar contato com o RH",
      dataProximaAcao: b[10] === null ? "" : somarDias(h, b[10]),
      dataEntrada: somarDias(h, -60 - i * 5),
      linkInscricao: spec && spec.lk ? `https://inscricao.unimetrocamp.com.br/${slug(c(i))}/${slug(b[1])}` : "",
      linkConsultor: spec && spec.lk ? c(i) : "",
      convenio: spec ? {
        ...CONVENIO_VAZIO, ativo: true, status: "Ativo",
        dataInicio: somarDias(h, spec.ini), percentual: String(spec.pct),
        cursos: "Graduação e pós-graduação", responsavelAssinatura: "Gerência de RH",
        inscricoes: String(spec.insc), matriculasFinanceiras: String(spec.mf), matriculasAcademicas: String(spec.ma),
        ultimaDivulgacao: spec.div === null ? "" : somarDias(h, spec.div),
      } : null,
    }
  })
}
