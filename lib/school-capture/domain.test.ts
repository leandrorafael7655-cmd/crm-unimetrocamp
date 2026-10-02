import { describe, it, expect } from "vitest"
import { can } from "@/lib/domain/roles"
import { localActionDateTime } from "@/lib/company-actions/domain"
import {
  schoolCaptureSummaries,
  captureTotals,
  filterCaptureSummaries,
  EMPTY_CAPTURE_FILTERS,
  selectedCaptureCycle,
  validateCapturePayload,
  type CaptureData,
} from "./domain"
import type { AcaoEscola } from "@/lib/domain/high-school"

const u1 = "10000000-0000-0000-0000-000000000001",
  u2 = "10000000-0000-0000-0000-000000000002"
const c1 = "20000000-0000-0000-0000-000000000001",
  c2 = "20000000-0000-0000-0000-000000000002"
const now = "2026-10-02T00:30:00.000Z"
function fixture(): CaptureData {
  return {
    cycles: [
      {
        id: c1,
        name: "SuperVestibular 2027",
        edition: "2027",
        status: "captacao",
        is_active: true,
        capture_academic_year: 2026,
        campaign_start_at: null,
        campaign_end_at: null,
      },
      {
        id: c2,
        name: "SuperVestibular 2028",
        edition: "2028",
        status: "planejamento",
        is_active: false,
        capture_academic_year: 2027,
        campaign_start_at: null,
        campaign_end_at: null,
      },
    ],
    schools: [
      {
        id: "school",
        nome: "Escola Mapeada",
        rede: "Estadual",
        cidade: "Campinas",
        etapa: "Mapeada",
        seriesOferecidas: ["em3"],
      },
    ],
    estimates: [],
    grades: [
      {
        code: "em3",
        label: "3ª série EM",
        sortOrder: 50,
        supervestEligible: true,
        active: true,
      },
    ],
    institutionalContacts: [],
    contacts: [],
    engagements: [],
    actions: [],
    history: [],
    owners: [],
    officialSnapshots: [],
  }
}
function action(id = "action", patch: Partial<AcaoEscola> = {}): AcaoEscola {
  return {
    id,
    escolaId: "school",
    supervestCicloId: c1,
    data: "2026-10-24",
    inicio: "10:00",
    fim: "11:00",
    tipo: "Divulgação SuperVestibular",
    status: "agendada",
    primaryOwnerId: u1,
    participantes: [],
    resultados: [],
    ...patch,
  }
}
describe("captação compartilhada por edição", () => {
  it("inclui escola Mapeada com 3º ano, mesmo sem relacionamento ou contato", () => {
    const d = fixture(),
      r = schoolCaptureSummaries(d, d.cycles[0], now)[0]
    expect(r.metrics).toMatchObject({
      eligible: true,
      no_contact: true,
      no_engagement: true,
      to_schedule: true,
    })
    expect(r.school.primaryOwnerId).toBeUndefined()
  })
  it("mantém escolas sem séries no levantamento e considera o ano letivo, sem deduzir pelo ano da edição", () => {
    const d = fixture()
    d.schools[0].seriesOferecidas = null
    d.estimates = [
      {
        id: "estimate",
        escolaId: "school",
        anoLetivo: 2026,
        serie: "em3",
        estimativaAlunos: 30,
        numTurmas: 1,
      },
    ]
    expect(schoolCaptureSummaries(d, d.cycles[0], now)[0].eligibility).toBe(
      "eligible",
    )
    expect(schoolCaptureSummaries(d, d.cycles[1], now)[0].eligibility).toBe(
      "unknown",
    )
  })
  it("mostra dois consultores em aberto e mantém o outro visível após encerrar um", () => {
    const d = fixture()
    d.engagements = [u1, u2].map((id, i) => ({
      id: `e${i}`,
      school_id: "school",
      supervest_cycle_id: c1,
      user_id: id,
      user_name: `Consultor ${i}`,
      status: "em_negociacao",
      started_at: now,
      updated_at: now,
      ended_at: null,
      created_by: id,
    }))
    expect(
      schoolCaptureSummaries(d, d.cycles[0], now)[0].engagements,
    ).toHaveLength(2)
    d.engagements[0].ended_at = now
    d.engagements[0].status = "encerrada"
    const row = schoolCaptureSummaries(d, d.cycles[0], now)[0]
    expect(row.engagements.map((e) => e.user_id)).toEqual([u2])
    expect(d.engagements).toHaveLength(2)
    expect(row.participantIds).toContain(u1)
  })
  it("ações de 2027 não retiram pendências de 2028 e registros sem vínculo não contam", () => {
    const d = fixture()
    d.actions = [
      action("old", { status: "realizada", data: "2026-09-28" }),
      action("legacy", { supervestCicloId: null }),
    ]
    expect(
      schoolCaptureSummaries(d, d.cycles[0], now)[0].metrics.performed,
    ).toBe(true)
    expect(
      schoolCaptureSummaries(d, d.cycles[1], now)[0].metrics,
    ).toMatchObject({ no_contact: true, to_schedule: true, performed: false })
    expect(d.actions[0].supervestCicloId).toBe(c1)
  })
  it("diferencia pendente, zero e resultado positivo sem multiplicar apoios", () => {
    const d = fixture()
    d.actions = [
      action("one", {
        status: "realizada",
        data: "2026-09-28",
        participantes: [{ userId: u2 }, { userId: u1 }],
      }),
    ]
    let row = schoolCaptureSummaries(d, d.cycles[0], now)[0]
    expect(row.pendingResults).toHaveLength(1)
    d.actions[0].resultados = [
      {
        serie: "em3",
        turmas: 1,
        impactados: 0,
        leads: 0,
        inscricoesSupervest: 0,
        inscricoesPendentes: 0,
      },
    ]
    row = schoolCaptureSummaries(d, d.cycles[0], now)[0]
    expect(row.pendingResults).toHaveLength(0)
    expect(captureTotals([row])).toMatchObject({
      actions: 1,
      performed: 1,
      leads: 0,
      registrations: 0,
    })
    d.actions[0].resultados[0].leads = 20
    d.actions[0].resultados[0].inscricoesSupervest = 8
    expect(
      captureTotals(schoolCaptureSummaries(d, d.cycles[0], now)),
    ).toMatchObject({ actions: 1, leads: 20, registrations: 8 })
  })
  it("mantém ação realizada e compromisso futuro juntos; cancelada e vencida voltam para agendamento", () => {
    const d = fixture()
    d.actions = [
      action("done", { status: "realizada", data: "2026-09-20" }),
      action("future"),
    ]
    let r = schoolCaptureSummaries(d, d.cycles[0], now)[0]
    expect(r.performed).toHaveLength(1)
    expect(r.nextAction?.id).toBe("future")
    expect(r.alerts).toContain("Ação realizada com resultado pendente")
    d.actions = [action("cancelled", { status: "cancelada" })]
    r = schoolCaptureSummaries(d, d.cycles[0], now)[0]
    expect(r.metrics.to_schedule).toBe(true)
    expect(r.alerts).toContain("Ação cancelada: reagendar")
    d.actions = [action("overdue", { data: "2026-09-28" })]
    r = schoolCaptureSummaries(d, d.cycles[0], now)[0]
    expect(r.metrics.to_schedule).toBe(true)
    expect(r.actions[0].status).toBe("agendada")
    expect(r.metrics.performed).toBe(false)
  })
  it("mantém escola sem retorno, alerta prazo e filtra pela participação no ciclo", () => {
    const d = fixture()
    d.schools[0].etapa = "Sem retorno"
    d.engagements = [
      {
        id: "e",
        school_id: "school",
        supervest_cycle_id: c1,
        user_id: u1,
        user_name: "Carla",
        status: "aguardando_retorno",
        started_at: now,
        updated_at: now,
        ended_at: null,
        created_by: u1,
      },
    ]
    d.contacts = [
      {
        id: "contact",
        school_id: "school",
        supervest_cycle_id: c1,
        consultant_id: u1,
        consultant_name: "Carla",
        institutional_contact_id: null,
        occurred_at: "2026-09-28T13:00:00Z",
        person_name: "Direção",
        person_role: null,
        channel: "WhatsApp",
        description: "Contato",
        response: null,
        negotiation_status: "aguardando_retorno",
        next_step: "Retomar",
        return_at: "2026-09-30T12:00:00Z",
        created_by: u1,
        created_at: now,
      },
    ]
    d.actions = [action("support", { participantes: [{ userId: u2 }] })]
    const rows = schoolCaptureSummaries(d, d.cycles[0], now)
    expect(rows[0].alerts).toContain("Retorno vencido")
    expect(
      filterCaptureSummaries(rows, {
        ...EMPTY_CAPTURE_FILTERS,
        consultant: u2,
      }),
    ).toHaveLength(1)
    expect(
      filterCaptureSummaries(schoolCaptureSummaries(d, d.cycles[1], now), {
        ...EMPTY_CAPTURE_FILTERS,
        consultant: u2,
      }),
    ).toHaveLength(0)
  })
  it("preserva consulta histórica quando as séries institucionais mudam", () => {
    const d = fixture()
    d.schools[0].seriesOferecidas = ["em1"]
    d.actions = [action("old", { status: "realizada" })]
    expect(schoolCaptureSummaries(d, d.cycles[0], now)[0].eligibility).toBe(
      "ineligible",
    )
    expect(schoolCaptureSummaries(d, d.cycles[1], now)).toHaveLength(0)
  })
  it("abre a edição ativa por ID e usa o relógio de São Paulo", () => {
    const d = fixture()
    expect(selectedCaptureCycle([...d.cycles].reverse())?.id).toBe(c1)
    expect(selectedCaptureCycle(d.cycles, c2)?.id).toBe(c2)
    expect(localActionDateTime(now)).toEqual({
      date: "2026-10-01",
      time: "21:30",
    })
  })
  it("permite captação compartilhada sem ampliar edição institucional de B2B", () => {
    for (const role of [
      "gerente",
      "supervisor",
      "high_school",
      "consultor_b2b",
    ])
      expect(can(role, "hs.capture.write")).toBe(true)
    expect(can("consultor_b2b", "hs.write")).toBe(false)
  })
  it("valida zeros explícitos, horários, participantes e duplicidade de série", () => {
    const d = fixture()
    const p = {
      id: u1,
      results: [
        {
          grade: "em3",
          classes: 1,
          impacted: 0,
          leads: 0,
          pending: 0,
          registrations: 0,
        },
      ],
    }
    expect(validateCapturePayload("result", p, d.grades).results).toEqual(
      p.results,
    )
    expect(() =>
      validateCapturePayload(
        "result",
        { ...p, results: [{ ...p.results[0], leads: "" }] },
        d.grades,
      ),
    ).toThrow(/inclusive/)
    expect(() =>
      validateCapturePayload(
        "result",
        { ...p, results: [p.results[0], p.results[0]] },
        d.grades,
      ),
    ).toThrow(/repetida/)
    expect(() =>
      validateCapturePayload(
        "action",
        {
          action_date: "2026-10-24",
          start_time: "11:00",
          end_time: "10:00",
          primary_user_id: u1,
          support_ids: [],
          target_grades: ["em3"],
          objective: "Divulgação",
          location: "Escola",
          action_type: "Sala a sala",
          status: "agendada",
        },
        d.grades,
      ),
    ).toThrow(/posterior/)
  })
})
