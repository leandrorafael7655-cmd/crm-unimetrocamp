// Somente dados sintéticos. Nenhum acesso ao Supabase, convite ou envio de e-mail.
import { validateCapturePayload } from "../../lib/school-capture/domain.ts"

const uid = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`
export const captureActor = {
  id: uid(1),
  name: "Gestor de teste",
  role: "gerente",
}
export const captureCycleIds = [uid(27), uid(28)]
export const captureSchoolId = uid(90)
let data
export function resetCaptureFixtures() {
  data = {
    cycles: [27, 28].map((edition, i) => ({
      id: captureCycleIds[i],
      name: `SuperVestibular 20${edition}`,
      edition: `20${edition}`,
      status: i ? "planejamento" : "captacao",
      is_active: !i,
      capture_academic_year: 2026 + i,
      campaign_start_at: null,
      campaign_end_at: null,
    })),
    schools: [
      {
        id: captureSchoolId,
        nome: "Escola mapeada de teste",
        cidade: "Campinas",
        rede: "Pública",
        classificacao: "Bronze",
        etapa: "Mapeada",
        seriesOferecidas: ["em3"],
      },
      {
        id: uid(91),
        nome: "Escola com nome extenso " + "NomeExtenso".repeat(12),
        cidade: "Hortolândia",
        rede: "Particular",
        classificacao: "Ouro",
        etapa: "Mapeada",
        seriesOferecidas: null,
      },
    ],
    owners: [
      { id: uid(1), nome: captureActor.name, role: "gerente", active: true },
      {
        id: uid(2),
        nome: "Consultora de teste",
        role: "high_school",
        active: true,
      },
    ],
    grades: [
      {
        code: "em3",
        label: "3º ano EM",
        sortOrder: 1,
        supervestEligible: true,
        active: true,
      },
      {
        code: "em2",
        label: "2º ano EM",
        sortOrder: 2,
        supervestEligible: false,
        active: true,
      },
    ],
    estimates: [],
    institutionalContacts: [
      {
        id: uid(92),
        escolaId: captureSchoolId,
        nome: "Diretora de teste",
        papel: "Direção",
        principal: true,
      },
    ],
    contacts: [],
    engagements: [],
    actions: [],
    history: [],
    officialSnapshots: [
      {
        cycle_id: captureCycleIds[0],
        snapshot_date: "2026-10-01",
        official_registrations: 2800,
      },
    ],
  }
}
resetCaptureFixtures()
export const captureFixtureData = () => structuredClone(data)
const nameOf = (id) => data.owners.find((o) => o.id === id)?.nome
const now = () => "2026-10-02T00:30:00.000Z"
function begin(input, payload) {
  for (const id of [captureActor.id, ...payload.support_ids]) {
    const previous = data.engagements.find(
      (e) =>
        e.school_id === input.schoolId &&
        e.supervest_cycle_id === input.cycleId &&
        e.user_id === id &&
        !e.ended_at,
    )
    if (previous)
      Object.assign(previous, { status: payload.status, updated_at: now() })
    else
      data.engagements.push({
        id: crypto.randomUUID(),
        school_id: input.schoolId,
        supervest_cycle_id: input.cycleId,
        user_id: id,
        user_name: nameOf(id),
        status: payload.status,
        started_at: now(),
        updated_at: now(),
        ended_at: null,
        created_by: captureActor.id,
      })
  }
}
export const captureMocks = {
  loadSchoolCaptureData: async () => captureFixtureData(),
  saveSchoolCapture: async (input) => {
    const payload = validateCapturePayload(
      input.command,
      input.payload,
      data.grades,
    )
    const id = payload.id || crypto.randomUUID()
    if (input.command === "start" || input.command === "contact")
      begin(input, payload)
    if (input.command === "contact")
      data.contacts.push({
        id,
        school_id: input.schoolId,
        supervest_cycle_id: input.cycleId,
        consultant_id: captureActor.id,
        consultant_name: captureActor.name,
        created_by: captureActor.id,
        created_at: now(),
        ...payload,
        negotiation_status: payload.status,
      })
    if (input.command === "close") {
      const e = data.engagements.find((e) => e.id === id)
      e.status = "encerrada"
      e.ended_at = now()
      e.updated_at = now()
    }
    if (input.command === "action") {
      const existing = data.actions.find((a) => a.id === id)
      const row = {
        ...existing,
        id,
        escolaId: input.schoolId,
        escolaNome: data.schools.find((s) => s.id === input.schoolId).nome,
        supervestCicloId: input.cycleId,
        createdBy: captureActor.id,
        data: payload.action_date,
        inicio: payload.start_time,
        fim: payload.end_time,
        tipo: payload.action_type,
        status: payload.status,
        primaryOwnerId: payload.primary_user_id,
        consultorPrincipalNome: nameOf(payload.primary_user_id),
        participantes: payload.support_ids.map((userId) => ({
          userId,
          nome: nameOf(userId),
          papel: "Apoio",
        })),
        resultados: existing?.resultados || [],
        local: payload.location,
        contatoId: payload.contact_id,
        objetivo: payload.objective,
        observacoes: payload.notes,
        seriesAlvo: payload.target_grades,
        turmasDescricao: payload.class_details,
        estimativaAlunos: payload.estimated_students,
        estimativaTurmas: payload.estimated_classes,
        divulgacaoCaptacao: true,
      }
      data.actions = [...data.actions.filter((a) => a.id !== id), row]
    }
    if (input.command === "result") {
      const action = data.actions.find((a) => a.id === id)
      action.resultados = payload.results.map((r) => ({
        serie: r.grade,
        turmas: r.classes,
        impactados: r.impacted,
        leads: r.leads,
        inscricoesPendentes: r.pending,
        inscricoesSupervest: r.registrations,
      }))
      action.resultadoInformadoEm = now()
      action.resultadoObs = payload.notes
    }
    return { ok: true, message: "Registro de teste salvo.", id }
  },
  saveSchoolGrades: async (input) => {
    data.schools.find((s) => s.id === input.schoolId).seriesOferecidas =
      input.grades
    return { ok: true, message: "Séries confirmadas." }
  },
  configureCaptureCycle: async (form) => {
    Object.assign(
      data.cycles.find((c) => c.id === form.get("cycleId")),
      {
        capture_academic_year: Number(form.get("academicYear")),
        campaign_start_at: form.get("start") || null,
        campaign_end_at: form.get("end") || null,
        is_active: form.get("active") === "on",
      },
    )
    return { ok: true, message: "Edição configurada." }
  },
}
