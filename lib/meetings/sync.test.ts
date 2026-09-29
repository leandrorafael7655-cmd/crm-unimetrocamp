import { beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
const mocks = vi.hoisted(() => ({
  graph: vi.fn(),
  rpc: vi.fn(),
  claim: vi.fn(),
  writes: [] as Record<string, unknown>[],
}))
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { calendar_provider: "graph" }, error: null }) }) }),
      update: (values: Record<string, unknown>) => {
        mocks.writes.push(values)
        const builder = {
          eq: () => builder,
          not: () => builder,
          or: () => builder,
          select: () => builder,
          maybeSingle: () => mocks.claim(),
          then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
        }
        return builder
      },
    }),
    rpc: mocks.rpc,
  }),
}))
vi.mock("./microsoft", () => ({
  graphRequest: mocks.graph,
  GraphError: class extends Error {
    constructor(public status: number) {
      super("Graph error")
    }
  },
}))
import { syncMeeting } from "./sync"
const payload = {
  company_name: "X",
  contact_name: "Main",
  contact_email: "main@example.com",
  organizer_name: "Rafa",
  meeting_type: "presencial",
  title: "Reunião",
  description: "pauta",
  start_at: "2027-02-20T17:00:00Z",
  end_at: "2027-02-20T18:00:00Z",
  location: "Sala",
  participants: [],
}
const row = {
  id: "activity-id",
  organizer_user_id: "actor",
  outlook_event_id: null,
  sync_operation: "create",
  sync_payload: payload,
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.writes.length = 0
  mocks.rpc.mockResolvedValue({ error: null })
  mocks.claim.mockResolvedValue({ data: row, error: null })
})
describe("Outlook synchronization and failure recovery", () => {
  it("creates once using the persisted activity id as transactionId", async () => {
    mocks.graph.mockResolvedValue({ id: "outlook-1", changeKey: "1" })
    expect((await syncMeeting(row.id)).synced).toBe(true)
    expect(mocks.graph).toHaveBeenCalledTimes(1)
    const [organizer, path, request] = mocks.graph.mock.calls[0]
    expect([organizer, path, request.method]).toEqual(["actor", "/me/events", "POST"])
    expect(JSON.parse(request.body).transactionId).toBe(row.id)
    expect(mocks.rpc).toHaveBeenCalledWith(
      "b2b_finish_meeting",
      expect.objectContaining({ p_id: row.id, p_event: expect.objectContaining({ id: "outlook-1" }) }),
    )
  })
  it("resumes a creation whose Outlook id was saved before local completion failed", async () => {
    mocks.claim.mockResolvedValue({ data: { ...row, outlook_event_id: "outlook-1" }, error: null })
    mocks.graph.mockResolvedValue({ id: "outlook-1", changeKey: "1" })
    await syncMeeting(row.id)
    expect(mocks.graph).toHaveBeenCalledTimes(1)
    expect(mocks.graph).toHaveBeenCalledWith("actor", "/me/events/outlook-1")
  })
  it("patches the existing event, preserving its Teams body", async () => {
    mocks.claim.mockResolvedValue({
      data: { ...row, outlook_event_id: "outlook-1", sync_operation: "update" },
      error: null,
    })
    mocks.graph
      .mockResolvedValueOnce({
        id: "outlook-1",
        isOnlineMeeting: true,
        "@odata.etag": "etag",
        body: { content: "Teams blob" },
      })
      .mockResolvedValueOnce({ id: "outlook-1", changeKey: "2" })
    await syncMeeting(row.id)
    const [, path, request] = mocks.graph.mock.calls[1]
    expect([path, request.method]).toEqual(["/me/events/outlook-1", "PATCH"])
    expect(JSON.parse(request.body).body.content).toContain("Teams blob")
    expect(request.headers["If-Match"]).toBe("etag")
    expect(mocks.graph.mock.calls.some((c) => c[1] === "/me/events")).toBe(false)
  })
  it("cancels using the organizer endpoint, keeping the CRM activity", async () => {
    mocks.claim.mockResolvedValue({
      data: { ...row, outlook_event_id: "outlook-1", sync_operation: "cancel" },
      error: null,
    })
    mocks.graph.mockResolvedValue(undefined)
    expect((await syncMeeting(row.id)).synced).toBe(true)
    expect(mocks.graph).toHaveBeenCalledWith(
      "actor",
      "/me/events/outlook-1/cancel",
      expect.objectContaining({ method: "POST" }),
    )
  })
  it("does not call Graph when another worker has claimed the activity", async () => {
    mocks.claim.mockResolvedValue({ data: null, error: null })
    expect((await syncMeeting(row.id)).synced).toBe(false)
    expect(mocks.graph).not.toHaveBeenCalled()
  })
  it("persists a failed status and keeps the payload for retry", async () => {
    mocks.graph.mockRejectedValue(new Error("Temporariamente indisponível"))
    expect((await syncMeeting(row.id)).synced).toBe(false)
    expect(mocks.writes.at(-1)).toMatchObject({
      sync_status: "failed",
      sync_error: "Temporariamente indisponível",
    })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
