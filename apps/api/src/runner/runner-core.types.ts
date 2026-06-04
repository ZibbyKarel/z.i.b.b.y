import type { ZodType } from "zod"

/**
 * Which kind of thing a run executes. A single {@link RunnerCore} serves all
 * kinds; the discriminator lets per-entity wrappers (agent / skill /
 * pipeline-stage) project their own contract shape on top of the shared
 * machinery instead of duplicating spawn/log/sidecar/restart logic N times.
 */
export type RunKind = "agent" | "skill" | "pipeline-stage"

/**
 * The lifecycle states a run can be in. Mirrors the agent-run contract enum;
 * Phase 3 widens this with `awaiting-approval` (the runner pauses without a live
 * child). Kept as a local type so the runner package does not depend on a
 * particular resource's schema.
 */
export type RunnerRunStatus = "running" | "done" | "error" | "interrupted" | "awaiting-approval"

/**
 * The kind-agnostic fields every run record carries on disk and in memory. A
 * wrapper's record type extends this with its own fields (e.g. an agent run adds
 * `agentId`/`prompt`/`project`).
 */
export interface BaseRun {
  runId: string
  kind: RunKind
  status: RunnerRunStatus
  /** Progress 0–100, parsed from `PROGRESS <n>` lines the run emits. */
  pct: number
  /** Absolute working directory the process ran in (its sandbox folder). */
  cwd: string
  startedAt: string
  pid: number
  logFile: string
  /** Phase 6: process-group id for liveness probing; absent until then. */
  pgid?: number
}

/** Everything a wrapper must hand the core to spawn one run. */
export interface RunSpec {
  kind: RunKind
  /**
   * Base component of the run id and (by convention) the sandbox folder name —
   * `agentId`, `skillId`, or `${pipelineRunId}.${phaseId}`. Must be filename-safe.
   */
  ownerId: string
  command: string
  args: string[]
  /** The sandbox the process runs in; the core creates it before spawning. */
  cwd: string
  /**
   * Timestamp used for both the run id's middle segment and `startedAt`. Pass it
   * so a wrapper's sandbox-folder name and the resulting run id agree; defaults to
   * `Date.now()` when omitted.
   */
  startedMs?: number
  /** Extra fields the wrapper folds into its record via {@link KindStrategy.assemble}. */
  extra: Record<string, unknown>
}

/** A slice of a run's log read from a byte `offset` (matches `RunLogChunkSchema`). */
export interface RunLogChunk {
  content: string
  nextOffset: number
  done: boolean
}

/**
 * The per-kind plumbing the core needs: how to build a full record from the core
 * fields, and how to validate a record read back from disk on restart.
 */
export interface KindStrategy<R extends BaseRun> {
  /** Build the full sidecar record from the core's base fields + `spec.extra`. */
  assemble(base: BaseRun, spec: RunSpec): R
  /**
   * Validate (and default-fill) a sidecar read from disk on restart. The input is
   * untyped (`unknown`) so schemas may use `.default()` for back-compat without the
   * input type having to equal the fully-populated output `R`.
   */
  schema: ZodType<R, unknown>
}
