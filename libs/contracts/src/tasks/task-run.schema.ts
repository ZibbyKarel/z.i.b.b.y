import { z } from "zod";
import {
  GoalIterationSchema,
  GoalParkedDetailSchema,
  GoalParkedReasonSchema,
} from "../goals/goal-run.schema";
import { ChainRunStepSchema } from "../chains/chain.schema";
import { RunArtifactSchema, RunStatusSchema } from "../common.schema";
import {
  ParkedDetailSchema,
  PipelineCheckpointSchema,
  StageRunSchema,
} from "../pipelines/pipeline-run.schema";
import { AttachmentSchema, PrOutputSchema } from "./task.schema";

/**
 * The kind of processor running a task. `scheduled` is a task that has not been
 * dispatched yet (it has no run behind it — its `runId` is the task id), the other
 * three are the live/finished run kinds.
 */
export const RunKindSchema = z.enum(["agent", "pipeline", "goal", "chain", "scheduled"]);
export type RunKind = z.infer<typeof RunKindSchema>;

/**
 * The feed's status set: the six shared {@link RunStatusSchema} run states plus the
 * pre-run task states the unified feed also carries — `scheduled` (not yet fired),
 * `parked` (a retries/budget/iterations park awaiting an operator note), and Phase 8's
 * `held` (over a budget cap, behind an approval) and `queued` (waiting for a slot).
 * Kept as one explicit enum (rather than composed from `RunStatusSchema`) so the wire
 * type is a flat literal union the web's `FeedStatus` aliases 1:1.
 */
export const TaskRunStatusSchema = z.enum([
  ...RunStatusSchema.options,
  "scheduled",
  "parked",
  "held",
  "queued",
  // A task accepted by the interactive create path whose dispatch (classify + spawn)
  // is still running in the background — it has no run behind it yet (its `runId` is
  // the task id), and flips to `running` in place once the spawn completes.
  "pending",
]);
export type TaskRunStatus = z.infer<typeof TaskRunStatusSchema>;

/**
 * The processor handling a task: which kind (agent / pipeline / goal), the stored
 * definition `id`, and the human `name`. The operator model is "task is the entity,
 * the processor is metadata" — this is that metadata. Absent on a not-yet-dispatched
 * scheduled task whose target the classifier will pick later. `name` falls back to the
 * id when the definition was deleted (mirrors the web `runGlyph` catalog-miss handling).
 */
export const ProcessorSchema = z.object({
  kind: z.enum(["agent", "pipeline", "goal", "chain"]),
  id: z.string().min(1),
  name: z.string().min(1),
});
export type Processor = z.infer<typeof ProcessorSchema>;

/**
 * One row of the unified task feed — the server-side promotion of the web `RunView`.
 * A task is the entity that runs; the agent/pipeline/goal that processes it is the
 * `processor`. The merge (per-kind run lists + still-waiting scheduled tasks, with a
 * goal's maker/verifier child runs folded out) lives in the API now, not the client.
 *
 * Carries every kind-specific optional the detail surfaces need: agent `pct`/`prompt`,
 * pipeline `stageRuns`/`currentStage`/`parked`/`checkpoints`, goal `iterations`/
 * `goalParked`. Most are optional and present only for the relevant kind.
 */
export const TaskRunSchema = z.object({
  runId: z.string().min(1),
  kind: RunKindSchema,
  /** The routed agent/pipeline/goal id — `""` for a not-yet-dispatched scheduled task. */
  owner: z.string(),
  status: TaskRunStatusSchema,
  /** 0–100 for agent runs; null for pipeline/goal runs and scheduled tasks. */
  pct: z.number().nullable(),
  /** Short human task name from the New Task dialog; `""` when absent. */
  title: z.string(),
  prompt: z.string(),
  project: z.string(),
  /** Start time — for a scheduled task, the future fire time (sorts it to the top). */
  startedAt: z.string(),
  /** Log endpoint base — `"agents"` for agent runs, null for everything else (no single log). */
  logBase: z.literal("agents").nullable(),
  /** The processor handling the task; absent on an undispatched scheduled task. */
  processor: ProcessorSchema.optional(),
  /** The task record this run was dispatched from (when born from one). */
  taskId: z.string().optional(),
  /** Enriched from the task record: its display title (or text). */
  taskTitle: z.string().optional(),
  /** Enriched from the task record: its full free-text description. */
  taskText: z.string().optional(),
  /** Enriched from the task record: its uploaded attachment set (read-only in detail). */
  attachments: z.array(AttachmentSchema).optional(),
  /**
   * Enriched from the task record: the attachment set id (Phase 65), letting the detail
   * build the open-file serve URL (`GET /api/tasks/attachments/:setId/:name`). Optional —
   * absent for runs with no attachments (and every synthetic run literal predating this).
   */
  attachmentSetId: z.string().optional(),
  /** Enriched from the task record: the written-back run outcome. */
  taskOutcome: z.enum(["done", "error"]).optional(),
  /**
   * Enriched from the task record: the outcome summary — for a produced output it
   * carries the reference (a PR url, or a "file written" note), so the run detail can
   * surface an "open output" affordance and seed a follow-up task with it.
   */
  taskOutcomeSummary: z.string().optional(),
  /**
   * Enriched from the task record: when the outcome was written — the run's
   * completion time. Paired with `startedAt` the detail derives the total run
   * duration; absent for a run still in flight or with no written-back outcome.
   */
  taskOutcomeFinishedAt: z.string().optional(),
  /** Enriched from the task record: the operator's chosen terminal output kind. */
  taskOutputKind: z.enum(["pr", "file", "void"]).optional(),
  /**
   * Enriched from the task outcome: the structured PR result when the task's `pr`
   * output opened a PR (now Tier-2, no gate). Its presence is what makes the run
   * detail render the compact "Výstup úkolu" surface — just the PR link and the
   * coloured `+/−` line totals — in place of any draft/diffstat/log.
   */
  prOutput: PrOutputSchema.optional(),
  /**
   * Enriched from pipeline run: name of the artifact delivered as `file` output
   * (see `PipelineOutput`), for frontend preview.
   */
  outputArtifactName: z.string().optional(),
  /** Retries-parked pipeline runs: the parked surface (phase, attempts, note). */
  parked: ParkedDetailSchema.optional(),
  /** The engagement a task is attributed to (Phase 8) — drives the queued caption. */
  projectId: z.string().optional(),
  /** Held tasks: why the budget guard parked it. */
  heldReason: z.string().optional(),
  /** Held tasks: the spend-past-cap approval gating the override. */
  approvalId: z.string().optional(),
  /** Phase 9: when `paused-limit`, the epoch ms the usage window resets (countdown). */
  resumeAt: z.number().int().nullable().optional(),
  /** Phase 9: how many auto-resume cycles a limit-paused run has used ("2/3"). */
  limitResumeCycles: z.number().int().nonnegative().optional(),
  /** Phase 9: a window-deferred scheduled task (`deferredReason === "limit"`). */
  deferredLimit: z.boolean().optional(),
  /** Phase 9.3: checkpoint commits the runner made on the run branch (pipeline runs). */
  checkpoints: z.array(PipelineCheckpointSchema).optional(),
  /**
   * Souhrnná cena běhu (odhad USD): pro agent běh přímo z `AgentRun.costUsd`,
   * pro pipeline běh součet `stageRuns[].costUsd`. Absent = žádná data (starý
   * běh před touhle featurou), ne nula.
   */
  costUsd: z.number().optional(),
  /** Phase 28 (pipeline runs): the per-phase stage runs, for the detail's stage timeline. */
  stageRuns: z.array(StageRunSchema).optional(),
  /** Pipeline runs: the phase currently executing, for the timeline's live stage row. */
  currentStage: z.string().nullable().optional(),
  /** Phase 10 (goal runs): the goal definition id, for the detail's maxIterations lookup. */
  goalId: z.string().optional(),
  /** Phase 10 (goal runs): the per-iteration maker→verifier log for the timeline. */
  iterations: z.array(GoalIterationSchema).optional(),
  /** Phase 10 (goal runs): the parked surface (iteration, attempts, verdict file). */
  goalParked: GoalParkedDetailSchema.optional(),
  /** Phase 10 (goal runs): why the goal parked (iterations / budget / limit). */
  goalParkedReason: GoalParkedReasonSchema.optional(),
  /** Phase 05 (chain runs): the chain definition id, for the detail's step fold. */
  chainId: z.string().optional(),
  /** Phase 05 (chain runs): the per-step pipeline runs, folded into the detail. */
  steps: z.array(ChainRunStepSchema).optional(),
  /**
   * Phase 49 (agent runs): the captured `claude` session id, when the run emitted a
   * `system/init` line. Its presence tells the detail whether a re-run of an
   * errored/interrupted run can continue the same session (`--resume`, context
   * preserved) or must start fresh — driving the "Pokračovat" vs "Spustit znovu"
   * button label. Absent for non-agent runs and demo/test output.
   */
  sessionId: z.string().optional(),
});
export type TaskRun = z.infer<typeof TaskRunSchema>;

/**
 * One whitelisted task-run artifact: its name and text content. The unified
 * counterpart of the per-kind `PipelineRunArtifact` / `GoalRunArtifact` — the owning
 * runner still enforces its own allowlist server-side, so `name` is a plain string here.
 */
export const TaskRunArtifactSchema = RunArtifactSchema;
export type TaskRunArtifact = z.infer<typeof TaskRunArtifactSchema>;

/** Body accepted by `resumeTaskRun` — the operator's note for the resumed run. */
export const ResumeTaskRunSchema = z.object({
  note: z.string().optional(),
});
export type ResumeTaskRunInput = z.infer<typeof ResumeTaskRunSchema>;

/**
 * Body accepted by `assignTaskRunProject` (Phase 24 Part D) — the operator
 * reassigning a run into a project (or clearing it back to "bez projektu" with
 * `null`). Always an explicit choice, never derived — unlike the path-based
 * `matchProject` attribution a task gets at creation time.
 */
export const AssignTaskRunProjectSchema = z.object({
  projectId: z.string().nullable(),
});
export type AssignTaskRunProjectInput = z.infer<typeof AssignTaskRunProjectSchema>;
