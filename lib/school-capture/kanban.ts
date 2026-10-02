import {
  CAPTURE_STATUSES,
  UNIDENTIFIED_CONSULTANT,
  type SchoolCaptureSummary,
} from "./domain"

export type CaptureOrganization = "situation" | "consultant"
export interface CaptureKanbanColumn {
  id: string
  title: string
  rows: SchoolCaptureSummary[]
  actionCount: number | null
}

/** Recebe escolas únicas já filtradas, antes de qualquer repetição visual. */
export function captureConsultantStats(rows: SchoolCaptureSummary[]) {
  const stats = new Map<
    string,
    {
      id: string
      name: string
      schoolIds: Set<string>
      actionIds: Set<string>
    }
  >()
  for (const row of rows) {
    for (const attendance of row.attendances) {
      const stat = stats.get(attendance.id) ?? {
        id: attendance.id,
        name: attendance.name,
        schoolIds: new Set<string>(),
        actionIds: new Set<string>(),
      }
      stat.schoolIds.add(row.school.id)
      for (const id of attendance.actionIds) stat.actionIds.add(id)
      stats.set(attendance.id, stat)
    }
  }
  return [...stats.values()]
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .map((s) => ({
      id: s.id,
      name: s.name,
      schools: s.schoolIds.size,
      actions: s.actionIds.size,
    }))
}

export function captureKanbanColumns(
  rows: SchoolCaptureSummary[],
  organization: CaptureOrganization,
): CaptureKanbanColumn[] {
  if (organization === "situation") {
    return Object.entries(CAPTURE_STATUSES).map(([id, title]) => {
      const matching = rows.filter((r) => r.status === id)
      return {
        id,
        title,
        rows: matching,
        actionCount:
          id === "performed"
            ? matching.reduce((n, r) => n + r.performed.length, 0)
            : id === "scheduled"
              ? matching.reduce((n, r) => n + r.scheduled.length, 0)
              : null,
      }
    })
  }
  const pending = rows.filter((r) => r.metrics.to_schedule)
  const scheduled = rows.filter((r) => r.status === "scheduled")
  const unidentified = rows.filter((r) => r.unidentifiedPerformed.length > 0)
  return [
    {
      id: "to_schedule",
      title: "Sem atendimento — para agendar",
      rows: pending,
      actionCount: null,
    },
    {
      id: "scheduled",
      title: CAPTURE_STATUSES.scheduled,
      rows: scheduled,
      actionCount: scheduled.reduce((n, r) => n + r.scheduled.length, 0),
    },
    ...captureConsultantStats(rows).map((s) => ({
      id: s.id,
      title: `Atendidas por ${s.name}`,
      rows: rows.filter((r) => r.attendances.some((a) => a.id === s.id)),
      actionCount: s.actions,
    })),
    {
      id: UNIDENTIFIED_CONSULTANT,
      title: "Atendidas — consultor a identificar",
      rows: unidentified,
      actionCount: unidentified.reduce(
        (n, r) => n + r.unidentifiedPerformed.length,
        0,
      ),
    },
  ]
}
