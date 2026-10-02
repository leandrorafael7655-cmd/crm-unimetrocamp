import { describe, expect, it } from "vitest"
import type { AcaoEscola } from "@/lib/domain/high-school"
import {
  schoolCaptureSummaries,
  filterCaptureSummaries,
  captureTotals,
  EMPTY_CAPTURE_FILTERS,
  UNIDENTIFIED_CONSULTANT,
  type CaptureData,
  type CampaignContact,
} from "./domain"
import { captureKanbanColumns, captureConsultantStats } from "./kanban"

const uid = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const principal = uid(1),
  support = uid(2),
  recorder = uid(3),
  schoolId = uid(90)
const c27 = uid(27),
  c28 = uid(28),
  now = "2026-10-02T12:00:00.000Z"
function fixture(): CaptureData {
  return {
    cycles: [27, 28].map((year, i) => ({
      id: uid(year),
      name: `SuperVestibular 20${year}`,
      edition: `20${year}`,
      status: i ? "planejamento" : "captacao",
      is_active: !i,
      capture_academic_year: 2026 + i,
      campaign_start_at: null,
      campaign_end_at: null,
    })),
    schools: [
      {
        id: schoolId,
        nome: "Escola mapeada",
        etapa: "Mapeada",
        cidade: "Campinas",
        classificacao: "Bronze",
        rede: "Estadual",
        seriesOferecidas: ["em3"],
      },
    ],
    estimates: [],
    grades: [],
    institutionalContacts: [],
    contacts: [],
    engagements: [],
    actions: [],
    history: [],
    owners: [
      { id: principal, nome: "Carla", role: "high_school" },
      { id: support, nome: "Ramon", role: "consultor_b2b" },
      { id: recorder, nome: "Gestor", role: "gerente" },
    ],
    officialSnapshots: [],
  }
}
function action(patch: Partial<AcaoEscola> = {}): AcaoEscola {
  return {
    id: uid(100),
    escolaId: schoolId,
    supervestCicloId: c27,
    tipo: "Divulgação SuperVestibular",
    status: "agendada",
    data: "2026-10-24",
    inicio: "10:00",
    fim: "11:00",
    primaryOwnerId: principal,
    createdBy: recorder,
    participantes: [{ userId: support }],
    resultados: [],
    ...patch,
  }
}
function contact(patch: Partial<CampaignContact> = {}): CampaignContact {
  return {
    id: uid(200),
    school_id: schoolId,
    supervest_cycle_id: c27,
    consultant_id: recorder,
    consultant_name: "Gestor",
    institutional_contact_id: null,
    occurred_at: "2026-09-28T17:35:00Z",
    person_name: "Direção",
    person_role: null,
    channel: "WhatsApp",
    description: "Negociação",
    response: null,
    negotiation_status: "em_negociacao",
    next_step: "Retornar à direção",
    return_at: "2026-09-30T12:00:00Z",
    created_by: recorder,
    created_at: now,
    ...patch,
  }
}
function summaries(d: CaptureData, cycle = 0) {
  return schoolCaptureSummaries(d, d.cycles[cycle], now)
}

describe("Kanban de captação integrado à edição", () => {
  it("inclui escola mapeada com 3º ano sem contato e não presume que esteja pronta", () => {
    const d = fixture()
    d.engagements.push({
      id: uid(201),
      school_id: schoolId,
      supervest_cycle_id: c27,
      user_id: recorder,
      user_name: "Gestor",
      status: "agendamento_conjunto",
      started_at: now,
      updated_at: now,
      ended_at: null,
      created_by: recorder,
    })
    const row = summaries(d)[0]
    expect(row.status).toBe("no_contact")
    expect(row.metrics.to_schedule).toBe(true)
    expect(
      captureKanbanColumns([row], "situation").find(
        (c) => c.id === "no_contact",
      )?.rows,
    ).toEqual([row])
    expect(captureKanbanColumns([row], "consultant")[0].rows).toEqual([row])
  })
  it("mantém negociação e contatos por telefone, WhatsApp ou e-mail na fila de atendimento", () => {
    const d = fixture()
    for (const channel of ["Ligação", "WhatsApp", "E-mail"]) {
      d.contacts = [contact({ channel })]
      const rows = summaries(d)
      expect(rows[0].status).toBe("negotiating")
      expect(rows[0].metrics.performed).toBe(false)
      expect(rows[0].alerts).not.toContain("Sem contato no ciclo")
      expect(
        filterCaptureSummaries(rows, {
          ...EMPTY_CAPTURE_FILTERS,
          situation: "to_schedule",
        }),
      ).toHaveLength(1)
    }
  })
  it("exige prontidão registrada na negociação além de contato para a coluna Para agendar", () => {
    const d = fixture()
    d.contacts = [contact()]
    expect(summaries(d)[0].status).toBe("negotiating")
    d.contacts[0].negotiation_status = "agendamento_conjunto"
    expect(summaries(d)[0].status).toBe("ready_to_schedule")
    expect(summaries(d)[0].metrics.to_schedule).toBe(true)
  })
  it("um agendamento válido muda a escola e o cancelamento devolve a necessidade de agendar", () => {
    const d = fixture()
    d.actions = [action()]
    expect(summaries(d)[0].status).toBe("scheduled")
    expect(summaries(d)[0].nextAction?.id).toBe(uid(100))
    expect(summaries(d)[0].metrics.to_schedule).toBe(false)
    d.actions[0].status = "cancelada"
    const row = summaries(d)[0]
    expect(row.status).toBe("no_contact")
    expect(row.metrics.to_schedule).toBe(true)
    expect(row.alerts).toContain("Ação cancelada: reagendar")
    d.actions.push(action({ id: uid(101), status: "confirmada" }))
    expect(summaries(d)[0].status).toBe("scheduled")
    expect(summaries(d)[0].alerts).not.toContain("Ação cancelada: reagendar")
  })
  it("agendamento incompleto, vencido ou com horário inválido não elimina a pendência", () => {
    const d = fixture()
    for (const patch of [
      { fim: null },
      { fim: "09:00" },
      { data: "2026-09-20" },
    ]) {
      d.actions = [action(patch)]
      expect(summaries(d)[0].metrics.to_schedule).toBe(true)
      expect(summaries(d)[0].scheduled).toHaveLength(0)
      expect(summaries(d)[0].performed).toHaveLength(0)
    }
  })
  it("mantém Atendidas como prioridade e exibe também o próximo agendamento", () => {
    const d = fixture()
    d.actions = [
      action({ id: uid(99), status: "realizada", data: "2026-09-28" }),
      action(),
    ]
    const row = summaries(d)[0]
    expect(row.status).toBe("performed")
    expect(row.nextAction?.id).toBe(uid(100))
    expect(
      captureKanbanColumns([row], "situation").find((c) => c.id === "scheduled")
        ?.rows,
    ).toHaveLength(0)
    expect(captureTotals([row])).toMatchObject({
      actions: 2,
      scheduled: 1,
      performed: 1,
    })
  })
  it("atribui principal e apoio sem crédito ao cadastrador e sem duplicar totais gerais", () => {
    const d = fixture()
    d.actions = [
      action({
        status: "realizada",
        participantes: [
          { userId: support },
          { userId: principal },
          { userId: support },
        ],
      }),
      action({ id: uid(101), status: "realizada" }),
    ]
    const rows = summaries(d),
      columns = captureKanbanColumns(rows, "consultant")
    expect(columns.find((c) => c.id === principal)?.rows).toHaveLength(1)
    expect(columns.find((c) => c.id === support)?.rows).toHaveLength(1)
    expect(columns.find((c) => c.id === recorder)).toBeUndefined()
    expect(captureConsultantStats(rows)).toEqual([
      { id: principal, name: "Carla", schools: 1, actions: 2 },
      { id: support, name: "Ramon", schools: 1, actions: 2 },
    ])
    expect(captureTotals(columns.flatMap((c) => c.rows))).toMatchObject({
      actions: 2,
      performed: 2,
    })
    expect(rows.filter((r) => r.metrics.performed)).toHaveLength(1)
  })
  it("ações realizadas sem participantes identificados ficam sinalizadas sem atribuição inventada", () => {
    const d = fixture()
    d.actions = [
      action({
        status: "realizada",
        primaryOwnerId: null,
        participantes: [{ userId: "null", nome: "Usuário do histórico" }],
      }),
    ]
    const rows = summaries(d)
    expect(rows[0].attendances).toHaveLength(0)
    expect(
      captureKanbanColumns(rows, "consultant").find(
        (c) => c.id === UNIDENTIFIED_CONSULTANT,
      )?.rows,
    ).toHaveLength(1)
    expect(
      filterCaptureSummaries(rows, {
        ...EMPTY_CAPTURE_FILTERS,
        attendingConsultant: recorder,
      }),
    ).toHaveLength(0)
    expect(
      filterCaptureSummaries(rows, {
        ...EMPTY_CAPTURE_FILTERS,
        attendingConsultant: UNIDENTIFIED_CONSULTANT,
      }),
    ).toHaveLength(1)
  })
  it("preserva identificação histórica registrada quando uma conta foi removida", () => {
    const d = fixture()
    d.actions = [
      action({
        status: "realizada",
        primaryOwnerId: null,
        consultorPrincipalNome: "Consultora anterior",
        participantes: [],
      }),
    ]
    expect(summaries(d)[0].attendances[0]).toMatchObject({
      id: "historical:Consultora anterior",
      name: "Consultora anterior",
    })
    expect(summaries(d)[0].unidentifiedPerformed).toHaveLength(0)
  })
  it("diferencia consultor atuando de consultor que realizou e considera apenas atuações abertas", () => {
    const d = fixture()
    d.engagements = [
      {
        id: uid(202),
        school_id: schoolId,
        supervest_cycle_id: c27,
        user_id: recorder,
        user_name: "Gestor",
        status: "em_negociacao",
        started_at: now,
        updated_at: now,
        ended_at: null,
        created_by: recorder,
      },
    ]
    d.actions = [action({ status: "realizada" })]
    let rows = summaries(d)
    expect(
      filterCaptureSummaries(rows, {
        ...EMPTY_CAPTURE_FILTERS,
        actingConsultant: recorder,
        attendingConsultant: support,
      }),
    ).toHaveLength(1)
    expect(
      filterCaptureSummaries(rows, {
        ...EMPTY_CAPTURE_FILTERS,
        actingConsultant: support,
      }),
    ).toHaveLength(0)
    expect(
      filterCaptureSummaries(rows, {
        ...EMPTY_CAPTURE_FILTERS,
        attendingConsultant: recorder,
      }),
    ).toHaveLength(0)
    d.engagements[0].ended_at = now
    rows = summaries(d)
    expect(
      filterCaptureSummaries(rows, {
        ...EMPTY_CAPTURE_FILTERS,
        actingConsultant: recorder,
      }),
    ).toHaveLength(0)
    expect(
      filterCaptureSummaries(rows, {
        ...EMPTY_CAPTURE_FILTERS,
        attendingConsultant: support,
      }),
    ).toHaveLength(1)
  })
  it("isola 2027 de 2028 por ID, recupera resultados e preserva ações sem edição", () => {
    const d = fixture()
    const result = {
      serie: "em3",
      turmas: 1,
      impactados: 30,
      leads: 10,
      inscricoesSupervest: 4,
      inscricoesPendentes: 2,
    }
    d.actions = [
      action({ status: "realizada", resultados: [result] }),
      action({ id: uid(102), supervestCicloId: null, status: "realizada" }),
    ]
    expect(summaries(d)[0].registrations).toBe(4)
    expect(summaries(d, 1)[0]).toMatchObject({
      status: "no_contact",
      attendances: [],
      scheduled: [],
      performed: [],
    })
    expect(summaries(d, 1)[0].metrics.to_schedule).toBe(true)
    expect(summaries(d)[0].performed[0].resultados).toEqual([result])
    expect(d.actions[1].supervestCicloId).toBeNull()
  })
  it("contatos legados com marcação incorreta de divulgação não contam como atendimento", () => {
    const d = fixture()
    for (const tipo of ["Ligação", "WhatsApp", "E-mail"]) {
      d.actions = [
        action({ tipo, divulgacaoCaptacao: true, status: "realizada" }),
      ]
      expect(summaries(d)[0].performed).toHaveLength(0)
      expect(summaries(d)[0].metrics.to_schedule).toBe(true)
      expect(summaries(d)[0].status).toBe("negotiating")
      expect(summaries(d)[0].lastInteraction).toMatchObject({
        channel: tipo,
        author: "Gestor",
      })
    }
    d.actions = [
      action({ tipo: "Visita de relacionamento", status: "realizada" }),
    ]
    expect(summaries(d)[0].performed).toHaveLength(0)
    expect(summaries(d)[0].status).toBe("negotiating")
    d.actions = [
      action({
        tipo: "Sala a sala",
        divulgacaoCaptacao: true,
        status: "realizada",
      }),
    ]
    expect(summaries(d)[0].performed).toHaveLength(1)
  })
  it("indicadores individuais e colunas acompanham cidade, classificação, escola e situação", () => {
    const d = fixture()
    d.schools.push({
      ...d.schools[0],
      id: uid(91),
      nome: "Escola de Sumaré",
      cidade: "Sumaré",
      classificacao: "Ouro",
    })
    d.actions = [
      action({ status: "realizada" }),
      action({ id: uid(101), escolaId: uid(91), status: "realizada" }),
    ]
    const rows = filterCaptureSummaries(summaries(d), {
      ...EMPTY_CAPTURE_FILTERS,
      name: "mapeada",
      city: "Campinas",
      classification: "Bronze",
      status: "performed",
    })
    expect(rows).toHaveLength(1)
    expect(
      captureKanbanColumns(rows, "situation").reduce(
        (n, c) => n + c.rows.length,
        0,
      ),
    ).toBe(1)
    expect(
      captureConsultantStats(rows).every(
        (s) => s.schools === 1 && s.actions === 1,
      ),
    ).toBe(true)
  })
  it("zero informado resolve pendência, enquanto retorno vencido continua destacado", () => {
    const d = fixture()
    d.contacts = [contact()]
    d.engagements = [
      {
        id: uid(202),
        school_id: schoolId,
        supervest_cycle_id: c27,
        user_id: recorder,
        user_name: "Gestor",
        status: "aguardando_retorno",
        started_at: now,
        updated_at: now,
        ended_at: null,
        created_by: recorder,
      },
    ]
    d.actions = [action({ status: "realizada", data: "2026-09-28" })]
    expect(summaries(d)[0].alerts).toEqual(
      expect.arrayContaining([
        "Retorno vencido",
        "Ação realizada com resultado pendente",
      ]),
    )
    d.actions[0].resultados = [
      {
        serie: "em3",
        turmas: 0,
        impactados: 0,
        leads: 0,
        inscricoesSupervest: 0,
        inscricoesPendentes: 0,
      },
    ]
    expect(summaries(d)[0].pendingResults).toHaveLength(0)
    expect(summaries(d)[0].leads).toBe(0)
    expect(summaries(d)[0].alerts).toContain("Retorno vencido")
  })
})
