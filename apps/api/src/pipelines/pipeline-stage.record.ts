import { z } from "zod"
import type { BaseRun, KindStrategy, RunSpec } from "../runner/runner-core.types"

/**
 * On-disk / in-memory record for a single pipeline stage's child process. Carries
 * which pipeline run and phase it belongs to so the per-stage logs (one
 * `RunnerCore` run each) stay attributable. Not exposed over HTTP directly — the
 * `PipelineRun` aggregate references stages by `runId`.
 */
export const PipelineStageRecordSchema = z.object({
  runId: z.string().min(1),
  kind: z.literal("pipeline-stage").default("pipeline-stage"),
  status: z.enum(["running", "done", "error", "interrupted", "awaiting-approval", "paused-limit"]),
  pct: z.number().min(0).max(100),
  cwd: z.string(),
  startedAt: z.string(),
  pid: z.number().int(),
  logFile: z.string(),
  pgid: z.number().int().optional(),
  // Phase 9: the core stamps these when a stage child dies on a usage limit, so the
  // paused-limit stage record round-trips them across a restart (the aggregate copies
  // `resumeAt` up; the resume path drives off the aggregate, not the stage).
  resumeAt: z.number().int().nullable().optional(),
  limitResumeCycles: z.number().int().nonnegative().optional(),
  pipelineRunId: z.string(),
  phaseId: z.string(),
  attempt: z.number().int().min(1),
})

export type PipelineStageRecord = z.infer<typeof PipelineStageRecordSchema> & BaseRun

/** The strategy that teaches {@link RunnerCore} how to handle the `pipeline-stage` kind. */
export const pipelineStageStrategy: KindStrategy<PipelineStageRecord> = {
  schema: PipelineStageRecordSchema,
  assemble(base: BaseRun, spec: RunSpec): PipelineStageRecord {
    return {
      ...base,
      kind: "pipeline-stage",
      pipelineRunId: String(spec.extra.pipelineRunId ?? ""),
      phaseId: String(spec.extra.phaseId ?? ""),
      attempt: Number(spec.extra.attempt ?? 1),
    }
  },
}
