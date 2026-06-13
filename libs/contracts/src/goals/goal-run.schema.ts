import { z } from "zod"
import { AgentIdSchema } from "../agents/agent.schema"
import { WorkspaceSchema } from "../common.schema"

/**
 * Lifecycle of a whole goal run — a deliberate clone of {@link PipelineStateSchema}
 * semantics so the web `FeedStatus` mapping and `paused-limit`/`parked` handling
 * are reused, not reinvented: `running` while iterating, `done`/`failed` at the
 * end, `parked` when bounded effort is exhausted (iterations/budget/limit) and the
 * operator must decide, `paused-limit` when an iteration's maker died on a usage
 * limit (a pause, not a failure — and it does NOT burn an iteration).
 */
export const GoalStateSchema = z.enum(["running", "done", "parked", "failed", "paused-limit"])
export type GoalState = z.infer<typeof GoalStateSchema>

/**
 * Why a goal is `parked` — its own enum so it never pollutes the pipeline's
 * {@link ParkedReasonSchema}:
 * - `iterations`: the maxIterations fuse blew (the loop ran out of attempts).
 * - `budget`: a per-iteration budget check went over-cap mid-goal.
 * - `limit` (Phase 9.2): the usage-limit auto-resume flapped past the cap.
 * - `verifier-scope` (Phase 12.1/12.2): a `checks` verifier had no resolvable
 *   scope (no commands, no project checks) or no safe cwd (no worktree/project) —
 *   refused rather than running the full-repo default suite or running inside the
 *   repo. A misconfiguration the operator fixes (add commands / a project), not a
 *   retryable failure.
 * - `awaiting-resume` (Phase 12.4): on API restart a `running`/`paused-limit` goal is
 *   rehydrated but NOT auto-re-dispatched (Law 3 / Tier 3 — a respawn must not spawn
 *   a maker without approval). It is surfaced here as a pending operator resume
 *   decision; `resumeParked` continues it. The `GOAL_AUTO_RESUME=1` daemon flag
 *   restores the old auto-reconcile.
 * All are durable, no-live-child parks, resumable with an operator note.
 */
export const GoalParkedReasonSchema = z.enum([
  "iterations",
  "budget",
  "limit",
  "verifier-scope",
  "awaiting-resume",
])
export type GoalParkedReason = z.infer<typeof GoalParkedReasonSchema>

/** Status of one iteration's maker+verifier cycle. */
export const GoalIterationStatusSchema = z.enum(["running", "done", "failed", "paused-limit"])
export type GoalIterationStatus = z.infer<typeof GoalIterationStatusSchema>

/**
 * One iteration's record: which maker ran (its run ref so its log is pollable), the
 * verifier verdict, and the iteration status. A `paused-limit` iteration is NOT a
 * completed iteration — it re-dispatches the SAME index on resume (decision 9), so
 * the maxIterations fuse only counts `done` attempts.
 */
export const GoalIterationSchema = z.object({
  index: z.number().int().nonnegative(),
  makerKind: z.enum(["agent", "pipeline"]),
  /** The underlying agent-run / pipeline-run id the maker dispatched as. */
  makerRunRef: z.string().optional(),
  verifier: z.object({
    kind: z.enum(["checks", "claude"]),
    /** The verifier's own run ref, when it spawned a claude run. */
    runRef: z.string().optional(),
    satisfied: z.boolean(),
    /** The failing-check tail or the claude verdict text (feeds the next iteration). */
    output: z.string(),
  }),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  status: GoalIterationStatusSchema,
})
export type GoalIteration = z.infer<typeof GoalIterationSchema>

/** Detail of a parked goal — the surface the operator resumes from (mirror of ParkedDetail). */
export const GoalParkedDetailSchema = z.object({
  /** The iteration index the goal parked at. */
  iteration: z.number().int().nonnegative(),
  /** How many maker attempts had been made (index + 1). */
  attempts: z.number().int().min(1),
  /** Absolute path of the iteration verdict file (the failure context + note target). */
  verdictFile: z.string(),
  note: z.string().optional(),
})
export type GoalParkedDetail = z.infer<typeof GoalParkedDetailSchema>

/**
 * A run of a goal: the outer-loop aggregate, modeled on {@link PipelineRunSchema}
 * with `iterations[]` replacing `stageRuns[]`. Written to `<runRoot>/run.json` on
 * every transition and rebuilt by `reconstruct()` on init, so the loop survives a
 * restart and continues at `currentIteration` (continuation, not restart).
 */
export const GoalRunSchema = z.object({
  goalRunId: z.string().min(1),
  goalId: AgentIdSchema,
  status: GoalStateSchema,
  /** The task record this run was dispatched from, when it was born from one. */
  taskId: z.string().optional(),
  /** Iteration currently executing, or null once the run has finished/parked. */
  currentIteration: z.number().int().nonnegative().nullable(),
  iterations: z.array(GoalIterationSchema),
  startedAt: z.string().datetime(),
  /** Absolute shared root dir holding this run's per-iteration artifacts. */
  cwd: z.string(),
  /** Absolute path of the resolved target project, when started with one. */
  projectPath: z.string().optional(),
  /** The dedicated git worktree this run owns (Phase 3.1); iterations accrue commits on its branch. */
  workspace: WorkspaceSchema.optional(),
  /** Phase 9: when `paused-limit`, the epoch ms the usage window is expected to reset. */
  resumeAt: z.number().int().nullable().optional(),
  /** Phase 9: how many times this run has been auto-resumed off a usage-limit pause. */
  limitResumeCycles: z.number().int().nonnegative().optional(),
  /** Present while `parked` — which parking machine holds the run. */
  parkedReason: GoalParkedReasonSchema.optional(),
  /** Present while parked: the surface the operator resumes from. */
  parked: GoalParkedDetailSchema.optional(),
  /**
   * Decision 8: captured-if-available forensic field only. No native claude session
   * resume exists; cross-iteration / cross-restart continuation rides resume-context.
   */
  sessionId: z.string().optional(),
  /** Classifier terms (Phase 4) that routed the originating task here. */
  matchedTerms: z.array(z.string()).optional(),
})
export type GoalRun = z.infer<typeof GoalRunSchema>

/** Body accepted by `startGoalRun` (mirror of StartPipelineRunSchema + agent run fields). */
export const StartGoalRunSchema = z.object({
  project: z.string().optional(),
  files: z.array(z.string()).optional(),
  title: z.string().max(200).optional(),
})
export type StartGoalRunInput = z.infer<typeof StartGoalRunSchema>

/** Body accepted by `resumeGoalRun` — the operator's note for the resumed iteration. */
export const ResumeGoalRunSchema = z.object({
  note: z.string().optional(),
})
export type ResumeGoalRunInput = z.infer<typeof ResumeGoalRunSchema>
