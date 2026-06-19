import { z } from "zod";
import {
  GoalIterationSchema,
  GoalParkedDetailSchema,
  GoalParkedReasonSchema,
} from "../goals/goal-run.schema";
import {
  ParkedDetailSchema,
  PipelineCheckpointSchema,
  StageRunSchema,
} from "../pipelines/pipeline-run.schema";

/**
 * The kind of processor running a task. `scheduled` is a task that has not been
 * dispatched yet (it has no run behind it — its `runId` is the task id), the other
 * three are the live/finished run kinds.
 */
export const RunKindSchema = z.enum(["agent", "pipeline", "goal", "scheduled"]);
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
  "running",
  "done",
  "error",
  "interrupted",
  "awaiting-approval",
  "paused-limit",
  "scheduled",
  "parked",
  "held",
  "queued",
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
  kind: z.enum(["agent", "pipeline", "goal"]),
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
  /** Enriched from the task record: the written-back run outcome. */
  taskOutcome: z.enum(["done", "error"]).optional(),
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
});
export type TaskRun = z.infer<typeof TaskRunSchema>;

/**
 * One whitelisted task-run artifact: its name and text content. The unified
 * counterpart of the per-kind `PipelineRunArtifact` / `GoalRunArtifact` — the owning
 * runner still enforces its own allowlist server-side, so `name` is a plain string here.
 */
export const TaskRunArtifactSchema = z.object({
  name: z.string(),
  content: z.string(),
});
export type TaskRunArtifact = z.infer<typeof TaskRunArtifactSchema>;

/** Body accepted by `resumeTaskRun` — the operator's note for the resumed run. */
export const ResumeTaskRunSchema = z.object({
  note: z.string().optional(),
});
export type ResumeTaskRunInput = z.infer<typeof ResumeTaskRunSchema>;
