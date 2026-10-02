import "server-only"
import { createClient } from "@/lib/supabase/server"
import { requireCan } from "@/lib/auth/guards"
import {
  mapEscolaRow,
  mapEstimativaRow,
  mapContatoRow,
  mapGradeRow,
  mapAcaoRow,
  mapResultadoRow,
  type ParticipanteAcao,
} from "@/lib/domain/high-school"
import { profileDisplayName } from "@/lib/domain/user-display"
import type {
  CaptureData,
  CaptureCycle,
  CampaignContact,
  CampaignEngagement,
  CampaignAudit,
} from "@/lib/school-capture/domain"

type Row = Record<string, unknown>
async function everyPage(
  query: (
    start: number,
    end: number,
  ) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
): Promise<Row[]> {
  const rows: Row[] = []
  for (let start = 0; ; start += 500) {
    const { data, error } = await query(start, start + 499)
    if (error) throw new Error(`Falha ao carregar captação: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < 500) return rows
  }
}
export async function loadSchoolCaptureData(
  schoolId?: string,
): Promise<CaptureData> {
  await requireCan("hs.read")
  const supabase = await createClient()
  const rows = (table: string, schoolColumn?: string) =>
    everyPage((start, end) => {
      let query = supabase.from(table).select("*")
      if (schoolId && schoolColumn) query = query.eq(schoolColumn, schoolId)
      return query
        .order(
          table === "grade_levels"
            ? "sort_order"
            : table === "schools"
              ? "name"
              : "id",
        )
        .range(start, end)
    })
  const [
    cycles,
    schools,
    estimates,
    grades,
    people,
    contacts,
    engagements,
    actions,
    history,
    profiles,
    snapshots,
  ] = await Promise.all([
    rows("supervest_cycles"),
    rows("schools", "id"),
    rows("school_grade_estimates", "school_id"),
    rows("grade_levels"),
    rows("school_contacts", "school_id"),
    rows("school_campaign_contacts", "school_id"),
    rows("school_campaign_engagements", "school_id"),
    rows("school_actions", "school_id"),
    rows("school_campaign_history", "school_id"),
    everyPage((start, end) =>
      supabase
        .from("profiles")
        .select("id,full_name,consultant_tag,role,active")
        .order("id")
        .range(start, end),
    ),
    everyPage((start, end) =>
      supabase
        .from("supervest_snapshots")
        .select("cycle_id,snapshot_date,official_registrations")
        .order("snapshot_date", { ascending: false })
        .range(start, end),
    ),
  ])
  const participants = new Map<string, ParticipanteAcao[]>(),
    results = new Map<string, ReturnType<typeof mapResultadoRow>[]>()
  for (let start = 0; start < actions.length; start += 200) {
    const ids = actions.slice(start, start + 200).map((a) => String(a.id))
    const [parts, resultRows] = await Promise.all([
      everyPage((from, to) =>
        supabase
          .from("school_action_participants")
          .select("school_action_id,user_id,role_in_action,user_name")
          .in("school_action_id", ids)
          .order("user_id")
          .range(from, to),
      ),
      everyPage((from, to) =>
        supabase
          .from("school_action_grade_results")
          .select("*")
          .in("school_action_id", ids)
          .order("id")
          .range(from, to),
      ),
    ])
    for (const p of parts) {
      const id = String(p.school_action_id)
      const list = participants.get(id) ?? []
      const user = profiles.find((u) => u.id === p.user_id)
      list.push({
        userId: String(p.user_id),
        nome: String(
          p.user_name ??
            (user ? profileDisplayName(user) : "Usuário do histórico"),
        ),
        papelNaAcao: String(p.role_in_action ?? "Apoio"),
      })
      participants.set(id, list)
    }
    for (const r of resultRows) {
      const id = String(r.school_action_id)
      const list = results.get(id) ?? []
      list.push(mapResultadoRow(r))
      results.set(id, list)
    }
  }
  return {
    cycles: cycles.sort((a, b) =>
      String(b.created_at).localeCompare(String(a.created_at)),
    ) as unknown as CaptureCycle[],
    schools: schools.map(mapEscolaRow),
    estimates: estimates.map(mapEstimativaRow),
    grades: grades.map(mapGradeRow),
    institutionalContacts: people.map(mapContatoRow),
    contacts: contacts as unknown as CampaignContact[],
    engagements: engagements as unknown as CampaignEngagement[],
    history: history as unknown as CampaignAudit[],
    actions: actions.map((a) =>
      mapAcaoRow(
        { ...a, school_name: schools.find((s) => s.id === a.school_id)?.name },
        participants.get(String(a.id)) ?? [],
        results.get(String(a.id)) ?? [],
      ),
    ),
    owners: profiles
      .map((p) => ({
        id: String(p.id),
        nome: profileDisplayName(p),
        role: String(p.role),
        active: Boolean(p.active),
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    officialSnapshots: snapshots as unknown as CaptureData["officialSnapshots"],
  }
}
