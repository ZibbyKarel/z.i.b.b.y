import { z } from "zod"
import { LimitWindowSchema } from "../limits/limits.schema"

/**
 * The operator-owned global spend ceiling (Phase 8.1) — `data/budget.json`. When
 * account utilization (the rolling 5h or weekly window from `LimitsService`) crosses
 * one of these percentages, EVERY new dispatch is treated as over-cap and held
 * behind a `spend-past-cap` approval. Both optional (absent = no global pause on
 * that window); `.strict()` so an unknown key can't smuggle a third knob in. This is
 * the one config file the operator edits by hand / in Settings — same posture as
 * `mandate.json`.
 */
export const GlobalBudgetSchema = z
  .object({
    pauseAtRollingPct: z.number().min(0).max(100).optional(),
    pauseAtWeeklyPct: z.number().min(0).max(100).optional(),
  })
  .strict()
export type GlobalBudget = z.infer<typeof GlobalBudgetSchema>

/** A used/cap pair for one window. `cap` absent → unlimited on that axis. */
export const BudgetWindowUsageSchema = z.object({
  used: z.number().int().nonnegative(),
  cap: z.number().int().positive().optional(),
})
export type BudgetWindowUsage = z.infer<typeof BudgetWindowUsageSchema>

/** Per-engagement budget status: counts from the ledger + live runner registries. */
export const ProjectBudgetStatusSchema = z.object({
  projectId: z.string(),
  name: z.string(),
  daily: BudgetWindowUsageSchema,
  weekly: BudgetWindowUsageSchema,
  /** Top-level runs currently in flight for this project. */
  running: z.number().int().nonnegative(),
  maxConcurrent: z.number().int().positive().optional(),
  /** Tasks waiting for a concurrency slot. */
  queued: z.number().int().nonnegative(),
  /** Tasks held over a budget cap, awaiting a spend-past-cap approval. */
  held: z.number().int().nonnegative(),
})
export type ProjectBudgetStatus = z.infer<typeof ProjectBudgetStatusSchema>

/**
 * The whole budget readout backing the dashboard (Phase 8.1): the global account
 * ceiling (utilization + the operator's pause thresholds + whether we're currently
 * paused) plus one row per project. A pure read assembled from the dispatch ledger,
 * the runner registries and the task store.
 */
export const BudgetStatusSchema = z.object({
  global: z.object({
    rolling: LimitWindowSchema,
    weekly: LimitWindowSchema,
    stale: z.boolean(),
    pauseAtRollingPct: z.number().min(0).max(100).optional(),
    pauseAtWeeklyPct: z.number().min(0).max(100).optional(),
    /** True when a non-stale window is at/over its pause threshold → all dispatches hold. */
    paused: z.boolean(),
  }),
  projects: z.array(ProjectBudgetStatusSchema),
})
export type BudgetStatus = z.infer<typeof BudgetStatusSchema>
