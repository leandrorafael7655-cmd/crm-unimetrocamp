"use server"

import { randomBytes } from "node:crypto"
import { requireRole } from "@/lib/auth/guards"
import { createAdminClient } from "@/lib/supabase/admin"
import { recoveryRedirectUrl } from "@/lib/auth/recovery-email"
import { passwordProviderError } from "@/lib/auth/password-policy"

type Result = { ok: boolean; message: string; temporaryPassword?: string }

async function selectedUser(userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("Usuário inválido.")
  const admin = createAdminClient()
  const [{ data: profile, error }, auth] = await Promise.all([
    admin.from("profiles").select("id,full_name,email,active,password_reset_pending").eq("id", userId).maybeSingle(),
    admin.auth.admin.getUserById(userId),
  ])
  if (error || !profile || !profile.active || auth.error || !auth.data.user?.email || (auth.data.user as { deleted_at?: string }).deleted_at) {
    throw new Error("Selecione um colaborador ativo com uma conta válida.")
  }
  return { profile, email: auth.data.user.email, admin }
}

export async function sendUserRecovery(userId: string): Promise<Result> {
  try {
    const actor = await requireRole("gerente")
    const { admin, email } = await selectedUser(userId)
    const { data: audit, error: auditError } = await admin.from("user_access_history").insert({
      actor_id: actor.id, target_id: userId, action: "recovery_email", status: "pending",
    }).select("id").single()
    if (auditError || !audit) return { ok: false, message: "Não foi possível registrar a operação. Nenhum e-mail foi solicitado." }
    const { error } = await admin.auth.resetPasswordForEmail(email, { redirectTo: recoveryRedirectUrl() })
    const { error: historyError } = await admin.from("user_access_history").update({
      status: error ? "failed" : "succeeded", completed_at: new Date().toISOString(),
    }).eq("id", audit.id)
    if (error) return { ok: false, message: passwordProviderError(error.code) }
    if (historyError) return { ok: false, message: "O provedor aceitou o envio, mas a conclusão do histórico está pendente. Verifique antes de reenviar." }
    return { ok: true, message: `O provedor aceitou o envio de recuperação para ${email}. Confira a caixa de entrada e o spam.` }
  } catch {
    return { ok: false, message: "Operação restrita ao Gerente Comercial. Verifique o colaborador selecionado e tente novamente." }
  }
}

export async function createTemporaryPassword(userId: string): Promise<Result> {
  try {
    const actor = await requireRole("gerente")
    if (userId === actor.id) return { ok: false, message: "Use “Alterar minha senha” para alterar o seu próprio acesso." }
    const { admin, profile } = await selectedUser(userId)
    if (profile.password_reset_pending) return { ok: false, message: "Existe uma redefinição em andamento para este colaborador. Aguarde e tente novamente." }
    const { data: audit, error: auditError } = await admin.from("user_access_history").insert({
      actor_id: actor.id, target_id: userId, action: "temporary_password", status: "pending",
    }).select("id").single()
    if (auditError || !audit) return { ok: false, message: "Não foi possível registrar a operação. A senha não foi alterada." }
    const { data: locked, error: lockError } = await admin.from("profiles").update({
      must_change_password: true, password_reset_pending: true, password_reset_operation: audit.id,
    }).eq("id", userId).eq("password_reset_pending", false).select("id").maybeSingle()
    if (lockError || !locked) {
      await admin.from("user_access_history").update({ status: "failed", completed_at: new Date().toISOString() }).eq("id", audit.id)
      return { ok: false, message: "Não foi possível bloquear o acesso para redefinir a senha. Tente novamente." }
    }
    // Random bytes provide 144 bits of entropy. No password is stored or logged by the CRM.
    const temporaryPassword = `Uc!7aA${randomBytes(18).toString("base64url")}`
    let updateError: { code?: string } | null = null
    try {
      const response = await admin.auth.admin.updateUserById(userId, { password: temporaryPassword })
      updateError = response.error || (response.data.user?.id === userId ? null : { code: "update_not_confirmed" })
    } catch {
      updateError = { code: "network_failure" }
    }
    const { data: finished, error: finishError } = await admin.from("profiles").update({
      password_reset_pending: false,
      // Fail closed on an uncertain provider response; email recovery remains available.
      must_change_password: true,
    }).eq("id", userId).eq("password_reset_operation", audit.id).select("id").maybeSingle()
    const { error: historyError } = await admin.from("user_access_history").update({
      status: updateError || finishError || !finished ? "failed" : "succeeded", completed_at: new Date().toISOString(),
    }).eq("id", audit.id)
    if (updateError) return { ok: false, message: `${passwordProviderError(updateError.code)} O acesso permanece protegido; envie uma recuperação por e-mail.` }
    if (finishError || !finished || historyError) return { ok: false, message: "A operação não pôde ser concluída no histórico. A senha temporária não será exibida. Verifique o acesso antes de tentar novamente." }
    return { ok: true, message: "Senha temporária criada. O colaborador precisará escolher uma nova senha antes de acessar o CRM.", temporaryPassword }
  } catch {
    return { ok: false, message: "Operação restrita ao Gerente Comercial. Verifique o colaborador selecionado e tente novamente." }
  }
}

export async function listUserAccessHistory() {
  try {
    await requireRole("gerente")
    const { data, error } = await createAdminClient().from("user_access_history")
      .select("id,action,status,created_at,completed_at,actor:profiles!actor_id(full_name,email),target:profiles!target_id(full_name,email)")
      .order("created_at", { ascending: false }).limit(30)
    if (error) return { ok: false as const, message: "Não foi possível carregar o histórico.", entries: [] }
    return { ok: true as const, message: "", entries: data ?? [] }
  } catch {
    return { ok: false as const, message: "Histórico restrito ao Gerente Comercial.", entries: [] }
  }
}
