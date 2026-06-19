import { z } from "zod";

/**
 * Operator-owned runtime system config — `data/system-config.json`. These knobs were
 * formerly start-only environment variables (`TASK_TICK_MS`, `GOAL_AUTO_RESUME`, …);
 * they are now file-backed and editable from `/settings`, in
 * keeping with the Law "files are the source of truth". A missing/garbage file reads
 * as the schema default — every field has one, so `{}` parses to a complete config and
 * the defaults reproduce the historical "env unset" behaviour exactly.
 *
 * `.strict()` so a stale/renamed key can't smuggle in a knob the server doesn't honour.
 */
export const SystemConfigSchema = z
  .object({
    /** Task scheduler heartbeat (ms). `0` disables the loop (drive `tick()` directly). */
    taskTickMs: z.number().int().min(0).default(30_000),
    /** Channel watcher poll interval (ms). `0` disables. */
    channelTickMs: z.number().int().min(0).default(30_000),
    /** Automation scheduler loop interval (ms). `0` disables (the historical default). */
    automationTickMs: z.number().int().min(0).default(0),
    /** Limit-resume daemon scan interval (ms). `0` disables. */
    limitResumeTickMs: z.number().int().min(0).default(60_000),
    /** Max auto-resume cycles a limit-paused run gets before it is parked/failed. */
    limitResumeMax: z.number().int().min(1).default(3),
    /** Verifier shell wall-clock deadline (ms) for a goal `checks` verifier. */
    goalVerifyTimeoutMs: z.number().int().positive().default(600_000),
    /**
     * On boot, auto-re-dispatch `running`/`paused-limit` goals (unattended/headless
     * mode). Default `false` → goals are parked `awaiting-resume` for an explicit
     * operator resume (Law 3). The operator enables this for a launchd daemon.
     */
    goalAutoResume: z.boolean().default(false),
  })
  .strict();
export type SystemConfig = z.infer<typeof SystemConfigSchema>;
