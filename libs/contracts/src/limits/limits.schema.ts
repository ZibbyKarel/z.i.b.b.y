import { z } from "zod"

/**
 * Utilization of one interactive Claude window (the rolling 5-hour bucket and
 * the weekly bucket), as a whole percent in `[0, 100]`. This is the *server*-
 * computed utilization Anthropic returns in the `anthropic-ratelimit-unified-*`
 * response headers — not a local token estimate. The backend reads it live off a
 * minimal `/v1/messages` response (those same headers), falling back to the
 * status-line capture file; see `UsageFetcher` / `RateLimitsReader`. `resetsAt`
 * is when this window's utilization resets (epoch ms), or `null` when no reset is
 * known. Locale- and format-agnostic on purpose: the backend owns the numbers,
 * the frontend owns the words.
 */
export const LimitWindowSchema = z.object({
  usedPct: z.number().min(0).max(100),
  resetsAt: z.number().int().nonnegative().nullable(),
})
export type LimitWindow = z.infer<typeof LimitWindowSchema>

/**
 * The interactive-limits readout backing the dashboard panel: the rolling
 * 5-hour window and the weekly window. `capturedAt` is when Claude Code last
 * wrote the status-line reading (epoch ms, or `null` if it never has); `stale`
 * is `true` when there is no fresh reading — the status line only updates while
 * Claude Code is rendering, so a gap means the user stepped away and the last
 * percentages are merely aging, not wrong. Polled by the frontend for live
 * updates.
 */
export const LimitsSchema = z.object({
  rolling: LimitWindowSchema,
  weekly: LimitWindowSchema,
  capturedAt: z.number().int().nonnegative().nullable(),
  stale: z.boolean(),
})
export type Limits = z.infer<typeof LimitsSchema>
