import { expect, it } from "vitest"
import { companyAgendaItem } from "./company-agenda"
it("maps B2B meetings to São Paulo civil date across UTC midnight", () => {
  const item = companyAgendaItem({ id: "meeting", company_id: "company", organizer_user_id: "person", start_at: "2026-10-29T01:00:00Z", end_at: "2026-10-29T02:00:00Z", status: "agendada", title: "Reunião", company: { razao_social: "Fictícia" } }, true)
  expect(item).toMatchObject({ date: "2026-10-28", startTime: "22:00", endTime: "23:00", activity: "external", sourceType: "company_meeting", userId: "person" })
})
it("preserves date-only internal follow-ups without inventing an hour", () => {
  expect(companyAgendaItem({ id: "company", proxima_acao: "Ligar", data_proxima_acao: "2026-10-29", next_action_owner_id: "person", next_action_kind: "internal" }, false)).toMatchObject({ date: "2026-10-29", startTime: "", endTime: "", activity: "internal", sourceType: "company_activity" })
})
