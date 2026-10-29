import { beforeEach, expect, it, vi } from "vitest"
const state = vi.hoisted(() => ({ role: "gerente", rpc: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/guards", () => ({ requireRole: async (...roles: string[]) => {
  if (!roles.includes(state.role)) throw new Error("Sem permissão")
  return { id: "authenticated-manager", role: state.role }
} }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: state.rpc }) }))
import { saveB2bResult } from "@/app/actions/b2b-results"
const form = () => {
  const f = new FormData()
  for (const [key, value] of Object.entries({ company_id: "20000000-0000-4000-8000-000000000001", user_id: "10000000-0000-4000-8000-000000000004", commercial_cycle_id: "20000000-0000-4000-8000-000000000003", target_value: "10", registrations: "0", revision: "0" })) f.set(key, value)
  return f
}
beforeEach(() => { state.role = "gerente"; state.rpc.mockReset().mockResolvedValue({ error: null }) })
it.each(["supervisor", "consultor_b2b", "high_school"])("server action denies manual results to %s before touching the database", async role => {
  state.role = role; expect(await saveB2bResult(form())).toMatchObject({ ok: false }); expect(state.rpc).not.toHaveBeenCalled()
})
it("validates integers and does not convert invalid input to a measured zero", async () => {
  for (const value of ["-1", "NaN", "1.5", "2147483648"]) {
    const f = form(); f.set("registrations", value)
    expect(await saveB2bResult(f)).toMatchObject({ ok: false })
  }
  expect(state.rpc).not.toHaveBeenCalled()
})
it("passes zero/null distinctly and never trusts a submitted audit actor", async () => {
  const f = form(); f.set("changed_by", "forged-user"); f.set("target_value", "")
  expect(await saveB2bResult(f)).toMatchObject({ ok: true })
  expect(state.rpc).toHaveBeenCalledWith("save_b2b_result", expect.objectContaining({ p_target: null, p_registrations: 0 }))
  expect(JSON.stringify(state.rpc.mock.calls)).not.toContain("forged-user")
})
