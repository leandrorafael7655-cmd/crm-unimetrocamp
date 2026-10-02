import { beforeEach, describe, expect, it, vi } from "vitest"

const mock = vi.hoisted(() => ({ role: "gerente", required: false, pending: false, failedAudit: false, failPassword: false,
  reset: vi.fn(), updatePassword: vi.fn(), writes: [] as { table: string; value: Record<string, unknown> }[] }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth/guards", () => ({ requireRole: async (role: string) => {
  if (role !== mock.role || mock.required) throw new Error("Sem permissão")
  return { id: "10000000-0000-0000-0000-000000000001" }
} }))
vi.mock("@/lib/auth/recovery-email", () => ({ recoveryRedirectUrl: () => "https://uniconecta-crm.vercel.app/auth/callback?next=%2Fauth%2Freset-password" }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  auth: { resetPasswordForEmail: mock.reset, admin: {
    getUserById: async (id: string) => ({ data: { user: { id, email: "test@example.invalid" } }, error: null }),
    updateUserById: mock.updatePassword,
  } },
  from(table: string) {
    let writing = false
    const result = () => writing
      ? { data: mock.failedAudit && table === "user_access_history" ? null : { id: target }, error: mock.failedAudit && table === "user_access_history" ? {} : null }
      : { data: { id: target, full_name: "Teste", active: true, password_reset_pending: mock.pending }, error: null }
    const chain = {
      select: () => chain, eq: () => chain,
      insert(value: Record<string, unknown>) { writing = true; mock.writes.push({ table, value }); return chain },
      update(value: Record<string, unknown>) { writing = true; mock.writes.push({ table, value }); return chain },
      maybeSingle: async () => result(), single: async () => result(),
      then(resolve: (value: unknown) => unknown) { return Promise.resolve(result()).then(resolve) },
    }
    return chain
  },
}) }))
import { createTemporaryPassword, sendUserRecovery } from "@/app/actions/user-access"
const target = "10000000-0000-0000-0000-000000000002"
beforeEach(() => {
  vi.clearAllMocks(); mock.role = "gerente"; mock.required = false; mock.pending = false; mock.failedAudit = false; mock.failPassword = false; mock.writes = []
  mock.reset.mockResolvedValue({ error: null })
  mock.updatePassword.mockImplementation(async (id: string) => ({ error: mock.failPassword ? { code: "provider_failure" } : null, data: { user: { id } } }))
})
describe("Gerente Comercial access operations", () => {
  it.each(["supervisor", "consultor_b2b", "high_school"])("blocks %s on the server before accessing admin credentials", async role => {
    mock.role = role
    expect(await sendUserRecovery(target)).toMatchObject({ ok: false })
    expect(await createTemporaryPassword(target)).toMatchObject({ ok: false })
    expect(mock.reset).not.toHaveBeenCalled(); expect(mock.updatePassword).not.toHaveBeenCalled(); expect(mock.writes).toHaveLength(0)
  })
  it("blocks an administrator with a mandatory password change", async () => {
    mock.required = true
    expect(await createTemporaryPassword(target)).toMatchObject({ ok: false })
    expect(mock.updatePassword).not.toHaveBeenCalled()
  })
  it("audits the selected target and actor before sending recovery", async () => {
    expect(await sendUserRecovery(target)).toMatchObject({ ok: true })
    expect(mock.writes[0]).toMatchObject({ table: "user_access_history", value: { actor_id: "10000000-0000-0000-0000-000000000001", target_id: target, action: "recovery_email", status: "pending" } })
    expect(mock.writes[1].value.status).toBe("succeeded")
  })
  it("does not send recovery or change passwords when audit creation fails", async () => {
    mock.failedAudit = true
    expect(await sendUserRecovery(target)).toMatchObject({ ok: false })
    expect(await createTemporaryPassword(target)).toMatchObject({ ok: false })
    expect(mock.reset).not.toHaveBeenCalled(); expect(mock.updatePassword).not.toHaveBeenCalled()
  })
  it("records provider email failures without reporting success", async () => {
    mock.reset.mockResolvedValue({ error: { code: "over_email_send_rate_limit" } })
    expect(await sendUserRecovery(target)).toMatchObject({ ok: false })
    expect(mock.writes.at(-1)?.value.status).toBe("failed")
  })
  it("generates a temporary password only once after effective Auth update and never stores it", async () => {
    const result = await createTemporaryPassword(target)
    expect(result.ok).toBe(true)
    expect(result.temporaryPassword?.length).toBeGreaterThan(20)
    expect(mock.updatePassword).toHaveBeenCalledWith(target, { password: result.temporaryPassword })
    expect(mock.writes[1].value).toMatchObject({ must_change_password: true, password_reset_pending: true })
    expect(mock.writes[2].value).toMatchObject({ must_change_password: true, password_reset_pending: false })
    expect(JSON.stringify(mock.writes)).not.toContain(result.temporaryPassword)
  })
  it("does not expose a password when Auth refuses the update", async () => {
    mock.failPassword = true
    const result = await createTemporaryPassword(target)
    expect(result.ok).toBe(false); expect(result.temporaryPassword).toBeUndefined()
    expect(mock.writes.at(-1)?.value.status).toBe("failed")
  })
  it("rejects self-administration and a concurrent pending reset", async () => {
    expect(await createTemporaryPassword("10000000-0000-0000-0000-000000000001")).toMatchObject({ ok: false })
    mock.pending = true
    expect(await createTemporaryPassword(target)).toMatchObject({ ok: false })
    expect(mock.updatePassword).not.toHaveBeenCalled()
  })
})
