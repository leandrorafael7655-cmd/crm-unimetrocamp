"use server"

import { createClient as createIsolatedClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { getActor } from "@/lib/auth/guards"
import { clearRecovery, grantRecovery, hasRecovery } from "@/lib/auth/recovery-proof"
import { recoveryEmailClient, recoveryRedirectUrl } from "@/lib/auth/recovery-email"
import { passwordProviderError, passwordValidation, safeAuthDestination } from "@/lib/auth/password-policy"

type Result = { ok: boolean; message: string }
type CallbackInput = { code?: string; tokenHash?: string; type?: string; accessToken?: string; refreshToken?: string; next?: string; error?: string }

export async function requestPasswordRecovery(emailInput: string): Promise<Result> {
  if (typeof emailInput !== "string") return { ok: false, message: "Informe um e-mail válido." }
  const email = emailInput.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { ok: false, message: "Informe um e-mail válido." }
  try {
    const { error } = await recoveryEmailClient().auth.resetPasswordForEmail(email, { redirectTo: recoveryRedirectUrl() })
    if (error) return { ok: false, message: passwordProviderError(error.code) }
    return { ok: true, message: "Se existir uma conta com este e-mail, enviaremos um link para redefinir a senha." }
  } catch {
    return { ok: false, message: "Não foi possível enviar a recuperação. Tente novamente em alguns minutos." }
  }
}

export async function completeAuthCallback(input: CallbackInput): Promise<Result & { destination?: string }> {
  await clearRecovery()
  const next = safeAuthDestination(input.next)
  const recovering = next.startsWith("/auth/reset-password") || input.type === "recovery"
  const invalid = { ok: false, message: "O link é inválido, expirou ou já foi utilizado. Solicite um novo link." }
  if (input.error) return invalid
  try {
    const supabase = await createClient()
    let response
    if (input.tokenHash && input.type === "recovery") {
      response = await supabase.auth.verifyOtp({ token_hash: input.tokenHash, type: "recovery" })
    } else if (input.code && input.code.length <= 2048) {
      // Compatibility with links previously issued with PKCE on the same browser.
      response = await supabase.auth.exchangeCodeForSession(input.code)
    } else if (input.accessToken && input.refreshToken && input.type === "recovery") {
      response = await supabase.auth.setSession({ access_token: input.accessToken, refresh_token: input.refreshToken })
    } else {
      return invalid
    }
    if (response.error || !response.data.session || !response.data.user) return invalid
    const { data: verified, error } = await supabase.auth.getUser()
    const { data: claims } = await supabase.auth.getClaims()
    const sessionId = claims?.claims?.session_id
    if (error || !verified.user || typeof sessionId !== "string") return invalid
    if (recovering) await grantRecovery(verified.user.id, sessionId)
    return { ok: true, message: "Acesso validado.", destination: recovering ? "/auth/reset-password" : next }
  } catch {
    return invalid
  }
}

export async function passwordResetAccess(): Promise<{ allowed: boolean; required: boolean }> {
  const supabase = await createClient()
  const actor = await getActor()
  if (!actor?.active || actor.password_reset_pending) return { allowed: false, required: false }
  const { data } = await supabase.auth.getClaims()
  const sessionId = data?.claims?.session_id
  const required = actor.must_change_password === true
  return { allowed: required || (typeof sessionId === "string" && await hasRecovery(actor.id, sessionId)), required }
}

export async function saveRecoveredPassword(password: string, confirmation: string): Promise<Result> {
  const validation = passwordValidation(password, confirmation)
  if (validation) return { ok: false, message: validation }
  const access = await passwordResetAccess()
  if (!access.allowed) return { ok: false, message: "O link é inválido, expirou ou já foi utilizado. Solicite um novo link." }
  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return { ok: false, message: passwordProviderError(error.code) }
    await clearRecovery()
    // Revoke existing refresh tokens; the database also blocks old JWTs while a temporary password is pending.
    await supabase.auth.signOut({ scope: "global" })
    return { ok: true, message: "Senha atualizada com sucesso. Entre novamente usando a nova senha." }
  } catch {
    return { ok: false, message: "Não foi possível atualizar a senha. Solicite outro link e tente novamente." }
  }
}

export async function changeOwnPassword(currentPassword: string, password: string, confirmation: string): Promise<Result> {
  const validation = passwordValidation(password, confirmation)
  if (validation) return { ok: false, message: validation }
  const actor = await getActor()
  if (!actor?.active || actor.must_change_password || actor.password_reset_pending) return { ok: false, message: "Valide seu acesso antes de alterar a senha." }
  const server = await createClient()
  const { data } = await server.auth.getUser()
  if (!data.user?.email) return { ok: false, message: "Sua sessão expirou. Entre novamente." }
  try {
    // Validate the current password in an isolated client, without replacing the browser's cookies.
    const verifier = createIsolatedClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const signed = await verifier.auth.signInWithPassword({ email: data.user.email, password: currentPassword })
    if (signed.error || signed.data.user?.id !== actor.id) return { ok: false, message: "A senha atual está incorreta. Sua senha não foi alterada." }
    const { error } = await verifier.auth.updateUser({ password })
    if (error) {
      await verifier.auth.signOut({ scope: "local" })
      return { ok: false, message: passwordProviderError(error.code) }
    }
    await verifier.auth.signOut({ scope: "global" })
    await clearRecovery()
    await server.auth.signOut({ scope: "local" })
    return { ok: true, message: "Senha alterada com sucesso. Entre novamente usando a nova senha." }
  } catch {
    return { ok: false, message: "Não foi possível alterar sua senha. Tente novamente." }
  }
}
