import { z } from "zod";
import { AgentIdSchema } from "../agents/agent.schema";
import { WorkspaceSchema } from "../common.schema";
import { PipelineOutputSchema } from "./pipeline.schema";
import { StageVerdictSchema } from "./stage-verdict.schema";

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
  // Phase 9: the stage child died on a usage limit — a pause, not a failure.
  // Stashes a spawn spec (restart survival) and auto-resumes when the window resets.
  "paused-limit",
]);
export type StageRunStatus = z.infer<typeof StageRunStatusSchema>;

/**
 * Lifecycle of a whole pipeline run. Mirrors the dashboard's `PipelineState`:
 * `running` while executing, `done`/`failed` at the end, `parked` while a stage
 * waits on an approval (Phase 3).
 */
export const PipelineStateSchema = z.enum([
  "done",
  "parked",
  "failed",
  "running",
  // Phase 9: a stage paused on the usage limit (mid-stage) or the run halted at a
  // phase boundary because the window is exhausted. Auto-resumes on window reset;
  // unlike `parked` it is not an operator decision and burns no loop retries.
  "paused-limit",
]);
export type PipelineState = z.infer<typeof PipelineStateSchema>;

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
  /** A qualify phase's parsed verdict (Phase 45); absent on non-qualify phases. */
  verdict: StageVerdictSchema.optional(),
});
export type StageRun = z.infer<typeof StageRunSchema>;

/**
 * Why a run is `parked` — the parkings are different machines:
 * - `approval`: a live stage child is blocking on a gate decision; it does NOT
 *   survive a restart (the child dies with the API → reconciled to failed).
 * - `retries`: a loop exhausted its retries with `then: "park"`; no live child,
 *   durable, resumable with an operator note.
 * - `limit` (Phase 9): the usage-limit auto-resume flapped past `LIMIT_RESUME_MAX`;
 *   no live child, durable, resumable (re-enters at the parked phase, not the loop
 *   back-edge, and does NOT reset the loop retry map).
 * - `output`: a pipeline-level `pr` output sink is waiting on the PR gate. The phase
 *   chain already finished green — there is no live child, so (unlike `approval`) it
 *   is DURABLE: it survives a restart and resumes by re-entering output processing
 *   when the operator approves. `pendingOutput` records where to resume.
 */
export const ParkedReasonSchema = z.enum(["approval", "retries", "limit", "output"]);
export type ParkedReason = z.infer<typeof ParkedReasonSchema>;

/**
 * A checkpoint commit (Phase 9.3) the runner made on the run's `zibby/*` branch after
 * a phase landed `done` with a clean green tree. Durable across worktree cleanup (the
 * branch is never deleted), so the operator can see — and a resumed run continue from —
 * exactly what was committed when. Local commits only; the push/PR gate is untouched.
 */
export const PipelineCheckpointSchema = z.object({
  phaseId: z.string().min(1),
  /** Abbreviated commit sha on the run branch. */
  sha: z.string().min(1),
  at: z.string().datetime(),
});
export type PipelineCheckpoint = z.infer<typeof PipelineCheckpointSchema>;

/** Detail of a retries-parking: which phase, how many attempts, the failure file. */
export const ParkedDetailSchema = z.object({
  phaseId: z.string().min(1),
  attempts: z.number().int().min(1),
  /** Absolute path of the failure-context file (the retry handoff + note target). */
  failureFile: z.string(),
  note: z.string().optional(),
});
export type ParkedDetail = z.infer<typeof ParkedDetailSchema>;

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
  /**
   * The RunnerCore run id of the stage currently executing — set when a stage
   * spawns, cleared when it goes terminal (or the run ends). Lets the detail's
   * stage timeline tail the in-flight phase's log live, before that attempt
   * lands in `stageRuns` (which holds only terminal attempts).
   */
  currentStageRunId: z.string().optional(),
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
  /**
   * The dedicated git worktree this run works in (Phase 3.1), when the target
   * project is a git repo. Absent for non-git / projectless runs (direct-checkout
   * fallback). Persisted so resume/restart and the PR-gate diffstat keep it.
   */
  workspace: WorkspaceSchema.optional(),
  /**
   * Phase 9: when `status` is `paused-limit`, the epoch ms the usage window is
   * expected to reset. Copied up from the paused stage (mid-stage pause) or set
   * from the earliest window reset (boundary pause). Drives the auto-resume tick
   * and the UI countdown. Null/absent on every non-paused run.
   */
  resumeAt: z.number().int().nullable().optional(),
  /**
   * Phase 9: how many times this run has been auto-resumed off a usage-limit
   * pause. Past `LIMIT_RESUME_MAX` the run is parked (`parkedReason: "limit"`).
   */
  limitResumeCycles: z.number().int().nonnegative().optional(),
  /** Present while status is `parked` — which parking machine holds the run. */
  parkedReason: ParkedReasonSchema.optional(),
  /** Present while retries-parked: the surface the operator resumes from. */
  parked: ParkedDetailSchema.optional(),
  /**
   * Present while `parkedReason` is `output`: the index into the pipeline's
   * `outputs` of the `pr` sink awaiting approval. On approve the runner resumes
   * output processing from here; durable across restart.
   */
  pendingOutput: z.object({ index: z.number().int().nonnegative() }).optional(),
  /**
   * A per-run override of the pipeline definition's `outputs:`, set when a directed
   * task carried its own output choice (`createTask({ output })`). When present it
   * REPLACES `pipeline.outputs` for this run only — the runner reads
   * `outputsOverride ?? pipeline.outputs`. `[]` means the operator chose `void`
   * (suppress even a declared PR); absent means inherit the definition. Persisted so a
   * run parked mid-PR-gate resumes against the same sinks after a restart.
   */
  outputsOverride: z.array(PipelineOutputSchema).optional(),
  /** Persisted per-phase retry counters, so a parked run resumes accurately. */
  retries: z.record(z.string(), z.number()).optional(),
  /**
   * Phase 9.3: the checkpoint commits the runner made on the run branch after each
   * green phase. Append-only; surfaces in the run detail and feeds the resume-context
   * a resumed/retried phase is prefixed with ("items 1–4 done and committed").
   */
  checkpoints: z.array(PipelineCheckpointSchema).optional(),
  /**
   * Classifier terms (Phase 4) that routed the originating task here, persisted so
   * a parked/resumed run re-grounds each stage identically after a restart. They
   * drive memory-grounding MOC selection; absent for UI-started runs.
   */
  matchedTerms: z.array(z.string()).optional(),
  /**
   * Phase 12.6: the resolved check commands of the last `verify` phase that passed
   * in this run (runner-set from actual deterministic execution, never an agent
   * claim). Lets a goal whose maker IS this pipeline skip a second, identical
   * verification when its own checks verifier would run the same commands. Absent
   * if the pipeline has no verify phase or none passed.
   */
  verifyCommands: z.array(z.string()).optional(),
});
export type PipelineRun = z.infer<typeof PipelineRunSchema>;

/** Body accepted by `startPipelineRun`. */
export const StartPipelineRunSchema = z.object({
  project: z.string().optional(),
});
export type StartPipelineRunInput = z.infer<typeof StartPipelineRunSchema>;

/** Body accepted by `resumePipelineRun` — the operator's note for the retried phase. */
export const ResumePipelineRunSchema = z.object({
  note: z.string().optional(),
});
export type ResumePipelineRunInput = z.infer<typeof ResumePipelineRunSchema>;
