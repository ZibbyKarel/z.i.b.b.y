import { z } from "zod"

/**
 * Usage of one interactive Claude window (the rolling 5-hour bucket and the
 * weekly bucket). Locale- and format-agnostic on purpose: the backend owns the
 * raw numbers, the frontend owns the words. `usedTokens` is the real
 * input+output token total consumed in the window (read from the local Claude
 * Code transcripts); `limitTokens` is the configured cap. `usedPct` is derived
 * (`round(used / limit * 100)`, clamped to `[0, 100]`, `0` when the limit is
 * `0`) and carried explicitly so every consumer agrees on the rounding.
 */
export const LimitWindowSchema = z.object({
  usedTokens: z.number().int().nonnegative(),
  limitTokens: z.number().int().nonnegative(),
  usedPct: z.number().min(0).max(100),
})
export type LimitWindow = z.infer<typeof LimitWindowSchema>

/**
 * The interactive-limits readout backing the dashboard panel: the rolling
 * 5-hour window and the weekly window, both computed from real local usage.
 * Polled by the frontend for live updates.
 */
export const LimitsSchema = z.object({
  rolling: LimitWindowSchema,
  weekly: LimitWindowSchema,
})
export type Limits = z.infer<typeof LimitsSchema>
