import { beforeEach, describe, expect, it, vi } from "vitest"
import { callbackInput, containsAuthCallback } from "./callback-input"
import { passwordValidation, safeAuthDestination } from "./password-policy"

const mock = vi.hoisted(() => ({
  actor: { id: "test-user", active: true, must_change_password: false, password_reset_pending: false },
  auth: { verifyOtp: vi.fn(), exchangeCodeForSession: vi.fn(), setSession: vi.fn(), getUser: vi.fn(), getClaims: vi.fn(), updateUser: vi.fn(), signOut: vi.fn(), signInWithPassword: vi.fn(), resetPasswordForEmail: vi.fn() },
  grant: vi.fn(), clear: vi.fn(), proof: vi.fn(),
}))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: mock.auth }) }))
vi.mock("@/lib/auth/guards", () => ({ getActor: async () => mock.actor }))
vi.mock("@/lib/auth/recovery-proof", () => ({ grantRecovery: mock.grant, clearRecovery: mock.clear, hasRecovery: mock.proof }))
vi.mock("@/lib/auth/recovery-email", () => ({ recoveryEmailClient: () => ({ auth: mock.auth }), recoveryRedirectUrl: () => "https://uniconecta-crm.vercel.app/auth/callback?next=%2Fauth%2Freset-password" }))
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: mock.auth }) }))
import { changeOwnPassword, completeAuthCallback, passwordResetAccess, requestPasswordRecovery, saveRecoveredPassword } from "@/app/actions/password"

const newPassword = "TestOnly!23456"
beforeEach(() => {
  vi.resetAllMocks()
  Object.assign(mock.actor, { active: true, must_change_password: false, password_reset_pending: false })
  mock.auth.getUser.mockResolvedValue({ data: { user: { id: "test-user", email: "test@example.invalid" } }, error: null })
  mock.auth.getClaims.mockResolvedValue({ data: { claims: { session_id: "test-session" } } })
  mock.auth.updateUser.mockResolvedValue({ error: null })
  mock.auth.signOut.mockResolvedValue({ error: null })
  mock.proof.mockResolvedValue(false)
})

describe("Password callback and provider integration", () => {
  it("retains legacy PKCE, recovery token hash and implicit fragment inputs", () => {
    expect(callbackInput("?code=example&next=%2Fauth%2Freset-password", "")).toMatchObject({ code: "example", next: "/auth/reset-password" })
    expect(callbackInput("?token_hash=example&type=recovery", "")).toMatchObject({ tokenHash: "example", type: "recovery" })
    expect(callbackInput("?next=%2Fauth%2Freset-password", "#access_token=test&refresh_token=test&type=recovery")).toMatchObject({ accessToken: "test", refreshToken: "test", type: "recovery" })
    expect(containsAuthCallback(callbackInput("", "#error_code=otp_expired"))).toBe(true)
  })
  it("rejects external, backslash and control-character destinations", () => {
    for (const next of ["//evil.example", "/\\evil.example", "/x\ny", "https://evil.example"]) expect(safeAuthDestination(next)).toBe("/dashboard")
    expect(safeAuthDestination("/auth/reset-password")).toBe("/auth/reset-password")
  })
  it("requires strength and matching confirmation", () => {
    expect(passwordValidation("weak", "weak")).toBeTruthy()
    expect(passwordValidation(newPassword, "different")).toMatch(/coincidem/)
    expect(passwordValidation(newPassword, newPassword)).toBeNull()
  })
  it.each(["token", "pkce", "implicit"])("validates %s with the existing Auth provider", async kind => {
    const response = { data: { session: { access_token: "mock" }, user: { id: "test-user" } }, error: null }
    mock.auth.verifyOtp.mockResolvedValue(response); mock.auth.exchangeCodeForSession.mockResolvedValue(response); mock.auth.setSession.mockResolvedValue(response)
    const input = kind === "token" ? { tokenHash: "example", type: "recovery" } : kind === "pkce" ? { code: "example", next: "/auth/reset-password" } : { accessToken: "example", refreshToken: "example", type: "recovery" }
    expect(await completeAuthCallback(input)).toMatchObject({ ok: true, destination: "/auth/reset-password" })
    expect(mock.grant).toHaveBeenCalledWith("test-user", "test-session")
  })
  it("rejects expired or reused links without trusting an existing login", async () => {
    mock.auth.verifyOtp.mockResolvedValue({ error: { code: "otp_expired" }, data: {} })
    expect(await completeAuthCallback({ tokenHash: "used", type: "recovery" })).toMatchObject({ ok: false })
    expect(mock.grant).not.toHaveBeenCalled()
    expect(await completeAuthCallback({ error: "otp_expired" })).toMatchObject({ ok: false })
  })
  it("does not accept an ordinary logged-in session as recovery proof", async () => {
    expect(await passwordResetAccess()).toEqual({ allowed: false, required: false })
    expect(await saveRecoveredPassword(newPassword, newPassword)).toMatchObject({ ok: false })
    expect(mock.auth.updateUser).not.toHaveBeenCalled()
  })
  it("allows mandatory rotation but rejects a reset still in progress", async () => {
    mock.actor.must_change_password = true
    expect(await passwordResetAccess()).toEqual({ allowed: true, required: true })
    mock.actor.password_reset_pending = true
    expect(await passwordResetAccess()).toEqual({ allowed: false, required: false })
  })
  it("updates Auth effectively before confirming and revokes sessions", async () => {
    mock.proof.mockResolvedValue(true)
    expect(await saveRecoveredPassword(newPassword, newPassword)).toMatchObject({ ok: true })
    expect(mock.auth.updateUser).toHaveBeenCalledWith({ password: newPassword })
    expect(mock.auth.signOut).toHaveBeenCalledWith({ scope: "global" })
  })
  it("does not report success when Auth refuses the password", async () => {
    mock.proof.mockResolvedValue(true)
    mock.auth.updateUser.mockResolvedValue({ error: { code: "same_password" } })
    expect(await saveRecoveredPassword(newPassword, newPassword)).toMatchObject({ ok: false, message: expect.stringMatching(/diferente/) })
    expect(mock.auth.signOut).not.toHaveBeenCalled()
  })
  it("reports email provider failure instead of false success", async () => {
    mock.auth.resetPasswordForEmail.mockResolvedValue({ error: { code: "over_email_send_rate_limit" } })
    expect(await requestPasswordRecovery("test@example.invalid")).toMatchObject({ ok: false })
    mock.auth.resetPasswordForEmail.mockResolvedValue({ error: null })
    expect(await requestPasswordRecovery("test@example.invalid")).toMatchObject({ ok: true })
  })
  it("verifies current identity before changing one's own password", async () => {
    mock.auth.signInWithPassword.mockResolvedValue({ error: { code: "invalid_credentials" }, data: {} })
    expect(await changeOwnPassword("incorrect", newPassword, newPassword)).toMatchObject({ ok: false })
    expect(mock.auth.updateUser).not.toHaveBeenCalled()
    mock.auth.signInWithPassword.mockResolvedValue({ error: null, data: { user: { id: "test-user" } } })
    expect(await changeOwnPassword("mock-current", newPassword, newPassword)).toMatchObject({ ok: true })
  })
})
