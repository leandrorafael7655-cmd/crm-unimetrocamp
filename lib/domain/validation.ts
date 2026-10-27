/** Shared by forms and Server Actions. Calendar dates are civil dates in São Paulo. */
export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

export function isCivilDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export const isClockTime = (value: unknown): value is string =>
  typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)

export function validateSchedule(date: unknown, start?: string | null, end?: string | null, required = false): string | null {
  if (!isCivilDate(date)) return "Informe uma data válida."
  if (!start && !end && !required) return null
  if (!isClockTime(start) || !isClockTime(end)) return "Informe os horários inicial e final válidos."
  if (end <= start) return "O horário final deve ser posterior ao inicial no mesmo dia."
  return null
}

/** Routes allow an open return; a supplied return still needs a valid departure. */
export function validateRouteSchedule(date: unknown, start?: string | null, end?: string | null): string | null {
  if (!isCivilDate(date)) return "Informe uma data válida."
  if (end) return validateSchedule(date,start,end,true)
  return start && !isClockTime(start) ? "Informe um horário de saída válido." : null
}

export function nonNegativeInteger(value: unknown, optional = true): boolean {
  return optional && (value === null || value === undefined || value === "") ||
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 2147483647
}
