import { z } from "zod";
import type { BaseRun, KindStrategy, RunSpec } from "../runner/runner-core.types";

/**
 * On-disk / in-memory record for a single workflow stage's child process. Carries
 * which workflow run and phase it belongs to so the per-stage logs (one
 * `RunnerCore` run each) stay attributable. Not exposed over HTTP directly — the
 * `WorkflowRun` aggregate references stages by `runId`.
 */
export const WorkflowStageRecordSchema = z.object({
  runId: z.string().min(1),
  kind: z.literal("workflow-stage").default("workflow-stage"),
  status: z.enum(["running", "done", "error", "interrupted", "awaiting-approval", "paused-limit"]),
  pct: z.number().min(0).max(100),
  cwd: z.string(),
  startedAt: z.string(),
  pid: z.number().int(),
  logFile: z.string(),
  pgid: z.number().int().optional(),
  exitCode: z.number().int().nullable().optional(),
  // Phase 9: the core stamps these when a stage child dies on a usage limit, so the
  // paused-limit stage record round-trips them across a restart (the aggregate copies
  // `resumeAt` up; the resume path drives off the aggregate, not the stage).
  resumeAt: z.number().int().nullable().optional(),
  limitResumeCycles: z.number().int().nonnegative().optional(),
  /** Souhrnná cena téhle fáze (odhad USD, viz runner-core.types.ts `BaseRun.costUsd`). */
  costUsd: z.number().optional(),
  workflowRunId: z.string(),
  phaseId: z.string(),
  attempt: z.number().int().min(1),
});

export type WorkflowStageRecord = z.infer<typeof WorkflowStageRecordSchema> & BaseRun;

/** The strategy that teaches {@link RunnerCore} how to handle the `workflow-stage` kind. */
export const workflowStageStrategy: KindStrategy<WorkflowStageRecord> = {
  schema: WorkflowStageRecordSchema,
  assemble(base: BaseRun, spec: RunSpec): WorkflowStageRecord {
    return {
      ...base,
      kind: "workflow-stage",
      workflowRunId: String(spec.extra.workflowRunId ?? ""),
      phaseId: String(spec.extra.phaseId ?? ""),
      attempt: Number(spec.extra.attempt ?? 1),
    };
  },
};
