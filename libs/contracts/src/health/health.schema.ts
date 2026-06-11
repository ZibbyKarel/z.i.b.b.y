import { z } from "zod"

/**
 * The Claude CLI preflight verdict the health payload carries: whether a
 * claude-shaped run could start right now (`ok`), the probed CLI `version` on
 * success, or a short failure `reason` (`"missing"` when not on PATH).
 */
export const ClaudeHealthSchema = z.object({
  ok: z.boolean(),
  version: z.string().optional(),
  reason: z.string().optional(),
})
export type ClaudeHealth = z.infer<typeof ClaudeHealthSchema>

/**
 * Liveness/readiness payload returned by `getHealth`. `status` is `"ok"` when
 * the process is up and the Claude CLI preflight passes, `"degraded"` when the
 * API answers but claude-shaped runs would be refused (`claude.ok === false`).
 * Plus dynamic process metadata (`uptime` in seconds, ISO `timestamp`).
 */
export const HealthSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  uptime: z.number().nonnegative(),
  timestamp: z.string().datetime(),
  claude: ClaudeHealthSchema,
})
export type Health = z.infer<typeof HealthSchema>
