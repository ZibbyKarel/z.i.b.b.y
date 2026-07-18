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

/** The five heartbeat watchers probed for liveness (F6c). Closed enum — a new
 *  watcher is added here on purpose, never a free-form string. */
export const WatcherIdSchema = z.enum([
  "channel",
  "monitor",
  "scheduler",
  "task-scheduler",
  "limit-resume",
]);
export type WatcherId = z.infer<typeof WatcherIdSchema>;

/**
 * One watcher's heartbeat (F6c — "is it actually ticking"). `ok` armed and ticking
 * (or armed and not yet due); `stale` armed but its last tick is older than the
 * stale factor × its interval — the genuine fault; `disabled` intentionally off
 * (`tickMs <= 0`, the test/CI mode), never a fault (fail-open). `ageMs` is the age of
 * `lastTickAt` at probe time; `detail` a short human note (e.g. the channel poller's
 * last error).
 */
export const WatcherHealthSchema = z.object({
  id: WatcherIdSchema,
  status: z.enum(["ok", "stale", "disabled"]),
  tickMs: z.number().int().nonnegative(),
  lastTickAt: IsoDateTimeSchema.optional(),
  ageMs: z.number().int().nonnegative().optional(),
  detail: z.string().optional(),
});
export type WatcherHealth = z.infer<typeof WatcherHealthSchema>;

/**
 * Liveness/readiness payload returned by `getHealth`. `status` is `"ok"` when the
 * process is up, the Claude CLI preflight passes, and every subsystem is ok;
 * `"degraded"` when the API answers but something is impaired (claude refused, or a
 * subsystem `degraded`/`down`). Plus dynamic process metadata (`uptime` in seconds,
 * ISO `timestamp`) and the per-subsystem breakdown (M8 — never fail silently).
 *
 * `watchers` (F6c) carries the per-watcher heartbeat probes. A `stale` watcher
 * deliberately does NOT flip `status` to `degraded` in v1 (fail-open): it surfaces
 * as a briefing line and a settings-HUD indicator, never as a red process.
 */
export const HealthSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  uptime: z.number().nonnegative(),
  timestamp: IsoDateTimeSchema,
  claude: ClaudeHealthSchema,
  subsystems: z.array(SubsystemHealthSchema),
  watchers: z.array(WatcherHealthSchema),
});
export type Health = z.infer<typeof HealthSchema>;
