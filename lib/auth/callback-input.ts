export type AuthCallbackInput = {
  code?: string; tokenHash?: string; type?: string; accessToken?: string;
  refreshToken?: string; next?: string; error?: string
}

export function callbackInput(search: string, hash: string): AuthCallbackInput {
  const query = new URLSearchParams(search)
  const fragment = new URLSearchParams(hash.replace(/^#/, ""))
  const get = (key: string) => query.get(key) || fragment.get(key) || undefined
  return {
    code: get("code"), tokenHash: get("token_hash"), type: get("type"),
    accessToken: fragment.get("access_token") || undefined,
    refreshToken: fragment.get("refresh_token") || undefined,
    next: get("next"), error: get("error") || get("error_code"),
  }
}

export function containsAuthCallback(input: AuthCallbackInput) {
  return Boolean(input.code || input.tokenHash || input.accessToken || input.refreshToken || input.error)
}
