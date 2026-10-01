import { describe, expect, it } from "vitest"
import { actionTimestamp, companyHistory, httpLink, localActionDateTime, validateCompanyAction, type CompanyActionInput, type CompanyActionRow } from "./domain"
import type { Atividade } from "@/lib/domain/types"

const base: CompanyActionInput = {
  id: "10000000-0000-0000-0000-000000000001", companyId: "20000000-0000-0000-0000-000000000001",
  responsibleUserId: "30000000-0000-0000-0000-000000000001", actionType: "presencial",
  title: "  Visita à empresa  ", date: "2026-09-28", time: "14:35", description: " Apresentação das bolsas. ",
  result: "", notes: "", location: " Sede ", channel: "WhatsApp", promotionUrl: "javascript:alert(1)",
}
describe("completed company actions", () => {
  it("accepts past actions and resolves Brasília date/time independently of the browser timezone", () => {
    expect(actionTimestamp("2026-09-28", "14:35")).toBe("2026-09-28T17:35:00.000Z")
    expect(localActionDateTime("2026-10-02T01:45:00Z")).toEqual({ date: "2026-10-01", time: "22:45" })
    expect(actionTimestamp("2018-12-05", "14:35")).toBe("2018-12-05T16:35:00.000Z")
  })
  it.each([ ["2026-02-30", "14:00"], ["2026-09-28", "25:00"], ["28/09/2026", "14:00"], ["2018-11-04", "00:30"] ])("rejects invalid or nonexistent local time %s %s", (date, time) => {
    expect(() => actionTimestamp(date, time)).toThrow()
  })
  it("requires presencial location and removes fields belonging to online publicity", () => {
    expect(validateCompanyAction(base)).toMatchObject({ title: "Visita à empresa", location: "Sede", channel: null, promotion_url: null, result: null, notes: null })
    expect(() => validateCompanyAction({ ...base, location: " " })).toThrow(/local/)
  })
  it("requires an online channel, permits an omitted link and retains optional outcome and notes", () => {
    const action = { ...base, actionType: "online" as const, promotionUrl: "", result: " 20 interessados ", notes: " Contato com RH " }
    expect(validateCompanyAction(action)).toMatchObject({ channel: "WhatsApp", location: null, promotion_url: null, result: "20 interessados", notes: "Contato com RH" })
    expect(() => validateCompanyAction({ ...action, channel: " " })).toThrow(/canal/)
  })
  it("rejects unsafe URLs, blank required text and oversized inputs", () => {
    expect(() => validateCompanyAction({ ...base, actionType: "online" })).toThrow(/link/)
    for (const url of ["javascript:alert(1)", "ftp://example.com", "https://user:password@example.com", "not a url"]) expect(httpLink(url)).toBeUndefined()
    expect(httpLink("https://example.com/post?origem=crm")).toBe("https://example.com/post?origem=crm")
    expect(() => validateCompanyAction({ ...base, title: " " })).toThrow(/título/)
    expect(() => validateCompanyAction({ ...base, description: " " })).toThrow(/descrição/)
    expect(() => validateCompanyAction({ ...base, notes: "x".repeat(5001) })).toThrow(/5000/)
  })
  it("merges legacy contact history, orders by occurrence and filters the new action types without mutating input", () => {
    const action = (id: string, action_type: "presencial" | "online", occurred_at: string, created_at: string) => ({ id, action_type, occurred_at, created_at }) as CompanyActionRow
    const actions = [action("1", "online", "2026-09-28T18:00:00Z", "2026-10-01T15:00:00Z"), action("2", "presencial", "2026-09-29T13:00:00Z", "2026-09-29T13:00:00Z")]
    const legacy = [{ id: "3", data: "2026-09-30", tipo: "Ligação" }] as Atividade[]
    expect(companyHistory(actions, legacy).map(e => e.id)).toEqual(["3", "2", "1"])
    expect(companyHistory(actions, legacy, "online").map(e => e.id)).toEqual(["1"])
    expect(companyHistory(actions, legacy, "presencial").map(e => e.id)).toEqual(["2"])
    expect(actions.map(a => a.id)).toEqual(["1", "2"])
    expect(companyHistory([], legacy).map(e => e.id)).toEqual(["3"])
  })
})
