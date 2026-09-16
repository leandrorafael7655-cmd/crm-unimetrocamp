export interface ProfileNameLike {
  full_name?: string | null
  consultant_tag?: string | null
}

/**
 * A consultant_tag is stored as a stable slug because it is also used in links
 * and attribution. In the UI we turn that slug into a readable operational
 * name without changing the stored identifier.
 */
export function humanizeConsultantTag(tag?: string | null): string {
  const value = (tag ?? "").trim()
  if (!value) return ""

  // Tags created by the CRM are slug-like. Preserve custom tags that already
  // contain spaces/mixed formatting, but present generated slugs naturally.
  if (/^[a-z0-9_-]+$/.test(value)) {
    return value
      .split(/[-_]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  }

  return value
}

/** Tag first; full legal name only as fallback when no operational tag exists. */
export function profileDisplayName(profile?: ProfileNameLike | null, fallback = "Usuário"): string {
  const tagName = humanizeConsultantTag(profile?.consultant_tag)
  if (tagName) return tagName
  const fullName = (profile?.full_name ?? "").trim()
  return fullName || fallback
}
