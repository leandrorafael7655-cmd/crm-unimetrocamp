import { afterEach, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { flushCalendarQueue } from "./calendar-dispatch"

afterEach(() => vi.unstubAllEnvs())

it("isolated validation never contacts a provider when communications are disabled", async () => {
  vi.stubEnv("UNICONECTA_DISABLE_EXTERNAL_COMMUNICATIONS", "true")
  const invoke = vi.fn()
  const result = await flushCalendarQueue({ functions: { invoke } } as unknown as SupabaseClient)
  expect(invoke).not.toHaveBeenCalled()
  expect(result).toEqual({ configured: false, processed: 0, sent: 0, failed: 0, superseded: 0 })
})

it("a provider error does not masquerade as successful delivery", async () => {
  vi.stubEnv("UNICONECTA_DISABLE_EXTERNAL_COMMUNICATIONS", "false")
  const invoke = vi.fn().mockResolvedValueOnce({ data: { configured: true } })
    .mockResolvedValueOnce({ error: { message: "Provider unavailable" } })
  const result = await flushCalendarQueue({ functions: { invoke } } as unknown as SupabaseClient)
  expect(result).toMatchObject({ configured: true, sent: 0, error: "Provider unavailable" })
})
