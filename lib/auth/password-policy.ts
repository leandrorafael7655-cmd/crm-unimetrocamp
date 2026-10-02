export const PASSWORD_REQUIREMENTS = "Use pelo menos 12 caracteres, incluindo letras maiúsculas e minúsculas, número e símbolo."

export function passwordValidation(password: string, confirmation: string): string | null {
  if (typeof password !== "string" || typeof confirmation !== "string") return "Informe e confirme a nova senha."
  if (password.length < 12 || password.length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return PASSWORD_REQUIREMENTS
  }
  return password === confirmation ? null : "As senhas não coincidem."
}

export function safeAuthDestination(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || /[\\\x00-\x20]/.test(next)) return "/dashboard"
  return next
}

export function passwordProviderError(code?: string): string {
  if (code === "same_password") return "Escolha uma senha diferente da senha anterior."
  if (code === "weak_password") return "O provedor recusou esta senha. Use uma senha mais forte e evite senhas conhecidas."
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit") return "Muitas tentativas. Aguarde alguns minutos e tente novamente."
  if (code === "reauthentication_needed" || code === "reauthentication_not_valid") return "Sua sessão precisa ser validada novamente. Solicite outro link de recuperação."
  return "Não foi possível concluir a operação. Tente novamente ou solicite outro link de recuperação."
}
