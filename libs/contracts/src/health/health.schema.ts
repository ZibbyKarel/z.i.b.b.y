import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";

/**
 * The Claude CLI preflight verdict the health payload carries: whether a
 * claude-shaped run could start right now (`ok`), the probed CLI `version` on
 * success, or a short failure `reason` (`"missing"` when not on PATH).
 */
export const ClaudeHealthSchema = z.object({
  ok: z.boolean(),
  version: z.string().optional(),
  reason: z.string().optional(),
});
export type ClaudeHealth = z.infer<typeof ClaudeHealthSchema>;

/**
 * One subsystem's health (M8). `status`: `ok` reachable/healthy, `degraded`
 * answering but impaired (e.g. the scheduler loop intentionally disabled), `down`
 * unreachable. `detail` is a short human reason for a non-ok status.
 */
export const SubsystemHealthSchema = z.object({
  name: z.enum(["backend", "vault", "integrations", "scheduler"]),
  status: z.enum(["ok", "degraded", "down"]),
  detail: z.string().optional(),
});
export type SubsystemHealth = z.infer<typeof SubsystemHealthSchema>;

/**
 * Liveness/readiness payload returned by `getHealth`. `status` is `"ok"` when the
 * process is up, the Claude CLI preflight passes, and every subsystem is ok;
 * `"degraded"` when the API answers but something is impaired (claude refused, or a
 * subsystem `degraded`/`down`). Plus dynamic process metadata (`uptime` in seconds,
 * ISO `timestamp`) and the per-subsystem breakdown (M8 — never fail silently).
 */
export const HealthSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  uptime: z.number().nonnegative(),
  timestamp: IsoDateTimeSchema,
  claude: ClaudeHealthSchema,
  subsystems: z.array(SubsystemHealthSchema),
});
export type Health = z.infer<typeof HealthSchema>;
