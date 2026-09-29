import "server-only"
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeEmail } from "./domain"
import type { MicrosoftConnection } from "./types"

const required = [
  "MICROSOFT_TENANT_ID",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "MICROSOFT_REDIRECT_URI",
  "MICROSOFT_TOKEN_ENCRYPTION_KEY",
] as const
export const MICROSOFT_SCOPES = "openid profile offline_access User.Read Calendars.ReadWrite"
export function microsoftConfig() {
  const missing: string[] = required.filter((key) => !process.env[key]?.trim())
  if (
    process.env.MICROSOFT_TOKEN_ENCRYPTION_KEY &&
    Buffer.from(process.env.MICROSOFT_TOKEN_ENCRYPTION_KEY, "base64").length !== 32
  )
    missing.push("MICROSOFT_TOKEN_ENCRYPTION_KEY (32 bytes em base64)")
  if (process.env.MICROSOFT_TENANT_ID && !/^[a-z0-9.-]+$/i.test(process.env.MICROSOFT_TENANT_ID))
    missing.push("MICROSOFT_TENANT_ID inválido")
  if (["common", "consumers", "organizations"].includes(process.env.MICROSOFT_TENANT_ID || ""))
    missing.push("MICROSOFT_TENANT_ID (tenant corporativo específico)")
  if (process.env.MICROSOFT_REDIRECT_URI) {
    try {
      const uri = new URL(process.env.MICROSOFT_REDIRECT_URI)
      if (
        (uri.protocol !== "https:" && !(uri.protocol === "http:" && uri.hostname === "localhost")) ||
        uri.pathname !== "/api/microsoft/callback" ||
        uri.search ||
        uri.hash
      )
        missing.push("MICROSOFT_REDIRECT_URI inválido")
    } catch {
      missing.push("MICROSOFT_REDIRECT_URI inválido")
    }
  }
  return { configured: missing.length === 0, missing }
}
function config() {
  if (!microsoftConfig().configured)
    throw new Error("Integração Microsoft ainda não configurada. Procure a gerência.")
  return {
    tenant: process.env.MICROSOFT_TENANT_ID!,
    client: process.env.MICROSOFT_CLIENT_ID!,
    secret: process.env.MICROSOFT_CLIENT_SECRET!,
    redirect: process.env.MICROSOFT_REDIRECT_URI!,
  }
}
export function seal(value: string, context: string) {
  config()
  const iv = randomBytes(12),
    key = Buffer.from(process.env.MICROSOFT_TOKEN_ENCRYPTION_KEY!, "base64")
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  cipher.setAAD(Buffer.from(context))
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  return [iv, cipher.getAuthTag(), encrypted].map((b) => b.toString("base64url")).join(".")
}
export function unseal(value: string, context: string) {
  config()
  const [iv, tag, encrypted] = value.split(".").map((p) => Buffer.from(p, "base64url"))
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(process.env.MICROSOFT_TOKEN_ENCRYPTION_KEY!, "base64"),
    iv,
  )
  decipher.setAAD(Buffer.from(context))
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")
}
interface TokenResult {
  access_token: string
  refresh_token?: string
  expires_in: number
}
export async function exchangeMicrosoftToken(fields: Record<string, string>): Promise<TokenResult> {
  const c = config()
  const response = await fetch(`https://login.microsoftonline.com/${c.tenant}/oauth2/v2.0/token`, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.client,
      client_secret: c.secret,
      scope: MICROSOFT_SCOPES,
      ...fields,
    }),
  })
  if (!response.ok)
    throw new Error("A conexão Microsoft expirou ou não foi autorizada. Vincule novamente sua conta.")
  const token = (await response.json()) as TokenResult
  if (!token.access_token || !Number.isFinite(token.expires_in))
    throw new Error("Resposta de autenticação Microsoft inválida.")
  return token
}
export async function connectionStatus(userId: string): Promise<MicrosoftConnection> {
  const settings = microsoftConfig()
  if (!settings.configured) return { ...settings, connected: false, email: null }
  const { data, error } = await createAdminClient()
    .from("microsoft_calendar_accounts")
    .select("email")
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw new Error("Não foi possível consultar a conexão Microsoft. Verifique a migração do banco.")
  return { ...settings, connected: !!data, email: data?.email ?? null }
}
export async function storeMicrosoftAccount(userId: string, profileEmail: string, token: TokenResult) {
  if (!token.refresh_token)
    throw new Error("Autorize o acesso contínuo ao calendário para vincular sua conta.")
  const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName", {
    headers: { Authorization: `Bearer ${token.access_token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error("Não foi possível identificar sua conta Microsoft.")
  const me = (await response.json()) as { id: string; mail: string | null; userPrincipalName: string }
  const email = normalizeEmail(me.mail || me.userPrincipalName || "")
  if (!email || email !== normalizeEmail(profileEmail))
    throw new Error("Use a conta Microsoft com o mesmo e-mail corporativo do seu perfil no UniConecta.")
  const admin = createAdminClient()
  const { data: prior, error: readError } = await admin
    .from("microsoft_calendar_accounts")
    .select("microsoft_user_id")
    .eq("user_id", userId)
    .maybeSingle()
  if (readError) throw new Error("Não foi possível consultar a vinculação.")
  if (prior && prior.microsoft_user_id !== me.id)
    throw new Error(
      "Este perfil já possui outra conta Microsoft vinculada. Procure a gerência para preservar os eventos existentes.",
    )
  const { error } = await admin.from("microsoft_calendar_accounts").upsert({
    user_id: userId,
    microsoft_user_id: me.id,
    tenant_id: config().tenant,
    email,
    access_token_encrypted: seal(token.access_token, userId),
    refresh_token_encrypted: seal(token.refresh_token, userId),
    expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error("Não foi possível salvar a vinculação Microsoft.")
}
async function accessToken(userId: string) {
  config()
  const admin = createAdminClient()
  const { data: account, error } = await admin
    .from("microsoft_calendar_accounts")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()
  if (error || !account) throw new Error("Vincule sua conta Microsoft para agendar reuniões.")
  if (account.tenant_id !== config().tenant)
    throw new Error("A organização Microsoft foi alterada. Vincule novamente sua conta.")
  if (Date.parse(account.expires_at) > Date.now() + 120000)
    return unseal(account.access_token_encrypted, userId)
  const token = await exchangeMicrosoftToken({
    grant_type: "refresh_token",
    refresh_token: unseal(account.refresh_token_encrypted, userId),
  })
  const { error: updateError } = await admin
    .from("microsoft_calendar_accounts")
    .update({
      access_token_encrypted: seal(token.access_token, userId),
      refresh_token_encrypted: token.refresh_token
        ? seal(token.refresh_token, userId)
        : account.refresh_token_encrypted,
      expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("refresh_token_encrypted", account.refresh_token_encrypted)
  if (updateError) throw new Error("Não foi possível renovar a conexão Microsoft.")
  return token.access_token
}
export class GraphError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(
      status === 403
        ? "A Microsoft não autorizou o calendário/Teams desta conta. Confira permissões e licença com a TI."
        : status === 401
          ? "Vincule novamente sua conta Microsoft."
          : status === 412
            ? "O evento foi alterado no Outlook. Atualize as respostas antes de editar."
            : status === 429
              ? "A Microsoft limitou temporariamente os pedidos. Tente novamente em alguns minutos."
              : status === 404
                ? "Evento não encontrado no Outlook. Verifique o calendário antes de tentar novamente."
                : `Falha na integração Outlook (HTTP ${status}). Tente sincronizar novamente.`,
    )
  }
}
export async function graphRequest<T>(userId: string, path: string, init: RequestInit = {}): Promise<T> {
  if (!path.startsWith("/me/")) throw new Error("Recurso Microsoft não permitido.")
  const token = await accessToken(userId)
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: 'IdType="ImmutableId", outlook.timezone="UTC"',
      ...init.headers,
    },
  })
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new GraphError(response.status, String(error?.error?.code || "GraphError"))
  }
  if (response.status === 202 || response.status === 204) return undefined as T
  return (await response.json()) as T
}
