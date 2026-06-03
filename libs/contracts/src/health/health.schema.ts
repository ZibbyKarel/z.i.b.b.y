import { z } from "zod"

/**
 * Liveness/readiness payload returned by `getHealth`. Deliberately minimal: a
 * literal `status` so consumers can discriminate, plus dynamic process metadata
 * (`uptime` in seconds, ISO `timestamp`) useful for probes and dashboards.
 */
export const HealthSchema = z.object({
  status: z.literal("ok"),
  uptime: z.number().nonnegative(),
  timestamp: z.string().datetime(),
})
export type Health = z.infer<typeof HealthSchema>
