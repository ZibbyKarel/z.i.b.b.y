import { z } from "zod"
import { AgentIdSchema } from "../agents/agent.schema"

/**
 * Status of a single stage's underlying run. The runner's full set, including
 * `awaiting-approval` (a stage paused on an approval — Phase 3, which maps the
 * pipeline to `parked`). Unifies with the shared `RunStatus` in Phase 3-1.
 */
export const StageRunStatusSchema = z.enum([
  "running",
  "done",
  "error",
  "interrupted",
  "awaiting-approval",
])
export type StageRunStatus = z.infer<typeof StageRunStatusSchema>

/**
 * Lifecycle of a whole pipeline run. Mirrors the dashboard's `PipelineState`:
 * `running` while executing, `done`/`failed` at the end, `parked` while a stage
 * waits on an approval (Phase 3).
 */
export const PipelineStateSchema = z.enum(["done", "parked", "failed", "running"])
export type PipelineState = z.infer<typeof PipelineStateSchema>

/**
 * One stage's execution within a pipeline run: which phase, the underlying
 * `RunnerCore` run id (so its log is pollable per phase), the attempt number
 * (incremented on a loop back-edge), and the stage status.
 */
export const StageRunSchema = z.object({
  phaseId: z.string().min(1),
  runId: z.string().min(1),
  attempt: z.number().int().min(1),
  status: StageRunStatusSchema,
})
export type StageRun = z.infer<typeof StageRunSchema>

/**
 * A run of a pipeline: the aggregate of its per-phase stage runs, the phase
 * currently executing, and an overall status mapped to {@link PipelineStateSchema}.
 */
export const PipelineRunSchema = z.object({
  pipelineRunId: z.string().min(1),
  pipelineId: AgentIdSchema,
  status: PipelineStateSchema,
  /** The task record this run was dispatched from, when it was born from one. */
  taskId: z.string().optional(),
  /** Phase id currently executing, or null once the run has finished. */
  currentStage: z.string().nullable(),
  stageRuns: z.array(StageRunSchema),
  startedAt: z.string().datetime(),
  /** Absolute shared root dir holding the per-phase sandboxes for this run. */
  cwd: z.string(),
  /**
   * Absolute path of the resolved target project, when the run was started with
   * one. Drives verify-phase cwd and claude-stage spawn cwd; persisted so
   * restart/parking keep it.
   */
  projectPath: z.string().optional(),
})
export type PipelineRun = z.infer<typeof PipelineRunSchema>

/** Body accepted by `startPipelineRun`. */
export const StartPipelineRunSchema = z.object({
  project: z.string().optional(),
})
export type StartPipelineRunInput = z.infer<typeof StartPipelineRunSchema>
