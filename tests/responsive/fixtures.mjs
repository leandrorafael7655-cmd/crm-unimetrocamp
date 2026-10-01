// Dados sintéticos: a validação visual não usa contas, banco ou credenciais reais.
import { validateCompanyAction } from "../../lib/company-actions/domain.ts"

let completedCompanyActions = []
export function resetCompanyActionFixtures() { completedCompanyActions = [] }
export const actor = { id: "manager", role: "gerente", active: true,
  full_name: "Rafael Xavier", display_name: "Rafael Xavier", email: "rafa@example.test" }
export const owners = [
  { id: "consultor", nome: "Consultor com nome completo extenso para validar a largura disponível", role: "consultor_b2b" },
  { id: "hs", nome: "Consultora High School", role: "high_school" },
]
export const schools = Array.from({ length: 5 }, (_, i) => ({
  id: "school-" + i, nome: "Colégio de Ensino Médio e Formação Profissional " + "NomeExtenso".repeat(i + 1),
  rede: "Particular", cidade: "Campinas", etapa: "Relacionamento ativo", classificacao: "Ouro",
  primaryOwnerId: "hs", potencial: "Alto", ultimaAcaoEm: "2026-08-01", proximaAcaoEm: "2026-10-15",
  proximaAcao: "Palestra e divulgação do SuperVestibular", email: "contato" + "escola".repeat(12) + "@example.test",
  telefone: "(19) 99999-9999", site: "https://example.test/" + "endereco".repeat(18),
  logradouro: "Avenida com nome extenso", numero: "123", bairro: "Centro",
}))
export const grades = [
  { code: "3em", label: "3ª série do Ensino Médio", sortOrder: 1, supervestEligible: true, active: true },
  { code: "2em", label: "2ª série do Ensino Médio", sortOrder: 2, supervestEligible: true, active: true },
]
export const actions = schools.map((e, i) => ({
  id: "action-" + i, escolaId: e.id, escolaNome: e.nome, data: "2026-10-15",
  inicio: "14:00", fim: "16:00", tipo: "Divulgação SuperVestibular", status: "agendada",
  objetivo: "Apresentar oportunidades de graduação", participantes: [{ userId: "hs", nome: "Consultora HS" }],
  primaryOwnerId: "hs", resultados: [{ serie: "3em", turmas: 3, impactados: 100, leads: 70, inscricoesSupervest: 40 }],
}))
export const cycle = { id: "sv", name: "SuperVestibular 2027", edition: "2027", status: "ativo",
  registrationsTarget: 7500, eventAt: "2026-10-24T17:00:00Z" }
export const goals = [{
  id: "goal", goalType: "high_school_leads", goalTypeLabel: "Leads High School",
  unit: "leads", scopeType: "individual", teamType: "high_school", userId: "hs",
  userName: owners[0].nome, targetValue: 5000, realizado: 2800, atingimentoPct: 56, faltante: 2200,
  startAt: "2026-07-01", endAt: "2026-11-30", status: "ativa", notes: "",
  supervestCycleId: "sv", commercialCycleId: "cc",
}]
export const settings = {
  timezone: "America/Sao_Paulo", scheduleStartDate: "2026-10-26",
  weekdayRoomOpen: "09:00", weekdayRoomClose: "21:00", roomEarlyStart: "09:00", roomEarlyEnd: "18:00",
  roomLateStart: "11:00", roomLateEnd: "20:00", morningStart: "09:00", morningEnd: "12:00",
  afternoonStart: "13:00", afternoonEnd: "18:00", saturdayStart: "09:00", saturdayEnd: "13:00",
  minRoomCoverage: 2, roomLocation: "Sala de matrícula", conversionLocation: "Sala comercial",
  externalLocation: "Atividade externa", roomEarlyBreaks: [], roomLateBreaks: [],
}
export const attendance = {
  start: "2026-10-26", end: "2026-12-06", actor, manager: true, settings,
  members: owners.map(o => ({ id: o.id, full_name: o.nome, email: "consultor@example.test", attendanceEnabled: true })),
  slots: [], rotation: [], cycles: [], exceptions: [], absences: [], providerStatus: { configured: true },
  occurrences: Array.from({ length: 7 }, (_, i) => ({
    id: "occ-" + i, date: "2026-10-" + (26 + i), userId: "consultor", responsibleName: owners[0].nome,
    responsibleEmail: "consultor@example.test", startTime: "09:00", endTime: "18:00",
    activity: "room", status: "published", location: "Sala de matrícula", slotKey: "s1", templateWeekIndex: 0,
  })).filter(o => o.date <= "2026-10-31"),
}
export const contact = { id: "contact", company_id: "company", nome: "Responsável da empresa",
  cargo: "Diretor Comercial", email: "responsavel" + "contato".repeat(10) + "@example.test",
  telefone: "(19) 99999-9999", is_primary: true }
export const meetingPanel = {
  ok: true, canEdit: true, contacts: [contact], meetings: [], organizer: { id: actor.id, name: actor.full_name, email: actor.email },
  microsoft: { connected: false }, connection: { connected: false }, emailConfigured: true, emailInvitations: { configured: true },
}
export const mockQueries = {
  getActor: async () => actor, requireActor: async () => actor, requireManager: async () => actor, requireCan: async () => actor,
  listSchools: async () => schools, listOwners: async () => owners, listActions: async () => actions,
  listGradeLevels: async () => grades, listEstimatesByEscola: async () => Object.fromEntries(schools.map(e => [e.id, ["3em"]])),
  getSchool360: async () => ({ escola: schools[0], contatos: [{ ...contact, escolaId: schools[0].id, principal: true }],
    estimativas: [{ id: "estimate", escolaId: schools[0].id, serie: "3em", anoLetivo: 2026, estimativaAlunos: 120, numTurmas: 4 }],
    acoes: actions, historicoEtapa: [], historicoDono: [] }),
  listGoals: async () => goals, metasAtivasComRealizado: async () => goals, realizadoDaMeta: async () => 2800,
  listCommercialCycles: async () => [{ id: "cc", name: "Captação 27.1" }],
  listSupervestCycles: async () => [cycle], getSupervestCycle: async () => cycle,
  listSupervestSnapshots: async () => [{ snapshotDate: "2026-09-15", officialRegistrations: 1800 }, { snapshotDate: "2026-09-30", officialRegistrations: 2800 }],
  apuracaoSupervest: async () => ({ oficial: 2800, hsAtribuidas: 1800, b2bAtribuidas: 350, outrosCanais: 650, inconsistente: false }),
  aderenciaDoConsultor: async () => ({ aderenciaPct: 80, semanasAtingidas: 8, semanasAplicaveis: 10, semanaCorrente: { completed: 2, target: 3, achieved: false } }),
  resumoB2B: async () => ({ carteira: 152, emNegociacao: 21, followupAtrasado: 14, semProximaAcao: 5, semContato30d: 8 }),
  resumoMapa: async () => ({ empresasGeo: 142, empresasSemGeo: 10, escolasGeo: 80, escolasSemGeo: 9 }),
  garantirFechamentoEmDia: async () => undefined,
  loadAttendanceRange: async () => attendance,
  loadCompanyMeetings: async () => meetingPanel,
  loadCompanyActions: async () => ({ ok: true, actions: completedCompanyActions,
    actor: { id: actor.id, name: actor.full_name }, canRegister: true,
    consultants: [{ id: actor.id, name: actor.full_name }, { id: owners[0].id, name: owners[0].nome }],
  }),
  saveCompanyAction: async input => {
    const row = { ...validateCompanyAction(input), id: input.id, company_id: input.companyId,
      responsible_user_id: input.responsibleUserId,
      responsible_name: input.responsibleUserId === actor.id ? actor.full_name : owners[0].nome,
      created_by: actor.id, creator_name: actor.full_name, created_at: new Date().toISOString() }
    completedCompanyActions = [...completedCompanyActions.filter(a => a.id !== row.id), row]
    return { ok: true, action: row, message: "Ação registrada no histórico da empresa." }
  },
  listManagedUsers: async () => ({ ok: true, users: owners.map(o => ({ id: o.id, full_name: o.nome, email: "consultor@example.test", role: o.role, active: true, attendance_enabled: true, consultant_tag: "Consultor" })) }),
  pontosDisponiveis: async () => schools.map(e => ({ id: e.id, tipo: "escola", nome: e.nome, cidade: "Campinas", lat: -22.9, lng: -47.06 })),
  listarPlanos: async () => [{ id: "plan", route_name: "Rota de escolas Campinas", plan_date: "2026-10-15", status: "rascunho", total_distance_m: 15000, total_duration_s: 3600 }],
  obterMeuEnderecoRota: async () => null,
  opcoesFiltroMapa: async () => ({ cidades: ["Campinas"], etapas: ["Mapeada"], responsaveis: owners }),
}
export function createMockClient() {
  const chain = (table) => {
    const result = { data: table === "supervest_cycles" ? null : [], error: null, count: 0 }
    let query
    query = new Proxy({}, { get: (_, key) => key === "then" ? resolve => Promise.resolve(result).then(resolve) : () => query })
    return query
  }
  return { from: chain, auth: {
    getUser: async () => ({ data: { user: actor }, error: null }),
    getSession: async () => ({ data: { session: { user: actor } }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => ({ error: null }),
  } }
}
