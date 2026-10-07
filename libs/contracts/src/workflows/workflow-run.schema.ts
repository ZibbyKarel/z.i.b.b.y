import { z } from "zod";
import { AgentIdSchema } from "../agents/agent.schema";
import { IsoDateTimeSchema, RunStatusSchema, WorkspaceSchema } from "../common.schema";
import { PrOutputSchema } from "../tasks/task.schema";
import { WorkflowOutputSchema } from "./workflow.schema";
import { StageVerdictSchema } from "./stage-verdict.schema";

/**
 * Status of a single stage's underlying run. The runner's full set, including
 * `awaiting-approval` (a stage paused on an approval — Phase 3, which maps the
 * workflow to `parked`). Unifies with the shared `RunStatus` in Phase 3-1.
 */
export const StageRunStatusSchema = z.enum(RunStatusSchema.options);
export type StageRunStatus = z.infer<typeof StageRunStatusSchema>;

/**
 * Lifecycle of a whole workflow run. Mirrors the dashboard's `WorkflowState`:
 * `running` while executing, `done`/`failed` at the end, `parked` while a stage
 * waits on an approval (Phase 3).
 */
export const WorkflowStateSchema = z.enum([
  "done",
  "parked",
  "failed",
  "running",
  // Phase 9: a stage paused on the usage limit (mid-stage) or the run halted at a
  // phase boundary because the window is exhausted. Auto-resumes on window reset;
  // unlike `parked` it is not an operator decision and burns no loop retries.
  "paused-limit",
  // Phase 43: the operator stopped a running run — its live stage child was killed
  // deliberately (mirrors the stage-level `StageRunStatusSchema` value this already
  // had). Distinct from `failed`: no retry/park logic runs on a stop.
  "interrupted",
]);
export type WorkflowState = z.infer<typeof WorkflowStateSchema>;

/**
 * One stage's execution within a workflow run: which phase, the underlying
 * `RunnerCore` run id (so its log is pollable per phase), the attempt number
 * (incremented on a loop back-edge), and the stage status.
 */
export const StageRunSchema = z.object({
  phaseId: z.string().min(1),
  runId: z.string().min(1),
  attempt: z.number().int().min(1),
  status: StageRunStatusSchema,
  /**
   * Folder name of this stage's sandbox under the run root, e.g. `"04_developer"`:
   * `<seq>_<phaseId>` where `seq` is the run-wide dispatch order, zero-padded to 2
   * digits (a >99th dispatch simply widens the number). Written at dispatch time,
   * so a loop's second run of the same phase gets its own folder instead of
   * overwriting the first. Absent on records from pre-numbering runs (whose folder
   * is the bare phase id) and on synthetic escalation markers (which own no folder).
   */
  dir: z.string().min(1).optional(),
  /** A qualify phase's parsed verdict (Phase 45); absent on non-qualify phases. */
  verdict: StageVerdictSchema.optional(),
  /**
   * Cena téhle fáze (odhad USD), zkopírovaná z dokončeného
   * `WorkflowStageRecord` po `waitForStage()`. Absent na starých bězích z
   * doby před touhle featurou a na synthetic escalation markerech.
   */
  costUsd: z.number().optional(),
  /**
   * P1-03 — non-model spend this dispatch reported (image APIs, …): the sum of
   * `costUsd` over the lines of `<stageDir>/costs.jsonl`. Absent when none.
   */
  externalCostUsd: z.number().nonnegative().optional(),
  /**
   * D-015: the employee (hired instance of `phase.agent`) the `EmployeeAllocator`
   * leased for this dispatch, and its display name at dispatch time. Absent on a
   * `verify` phase (which spawns no agent, so never acquires a lease) and on any
   * stage run recorded before this field existed.
   */
  employeeId: z.string().optional(),
  employeeName: z.string().optional(),
  /** A `workflow` phase: the child (sub-run) `workflowRunId` this stage ran. */
  childRunId: z.string().min(1).optional(),
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
 * - `output`: a workflow-level `pr` output sink is waiting on the PR gate. The phase
 *   chain already finished green — there is no live child, so (unlike `approval`) it
 *   is DURABLE: it survives a restart and resumes by re-entering output processing
 *   when the operator approves. `pendingOutput` records where to resume.
 * - `no-employee` (D-015): the next phase's department owns no employee of the
 *   phase's position (agent) — no live child, durable. There is no automatic
 *   resume; the operator hires the missing position (or reassigns one) and
 *   resumes the run, re-entering `drive()` at the same stage.
 */
export const ParkedReasonSchema = z.enum([
  "approval",
  "retries",
  "limit",
  "output",
  "no-employee",
  // P1-02: a phase with `approval: ask` finished; durable, `pendingGate` resumes it.
  "gate",
  // P1-03: the run's spend passed its cap; durable, `pendingGate` resumes it.
  "budget",
  // A `workflow` phase's sub-run is parked (or paused); durable, the parent continues
  // on its own once the child settles (`pendingChild`).
  "child",
]);
export type ParkedReason = z.infer<typeof ParkedReasonSchema>;

/**
 * A checkpoint commit (Phase 9.3) the runner made on the run's `zibby/*` branch after
 * a phase landed `done` with a clean green tree. Durable across worktree cleanup (the
 * branch is never deleted), so the operator can see — and a resumed run continue from —
 * exactly what was committed when. Local commits only; the push/PR gate is untouched.
 */
export const WorkflowCheckpointSchema = z.object({
  phaseId: z.string().min(1),
  /** Abbreviated commit sha on the run branch. */
  sha: z.string().min(1),
  at: IsoDateTimeSchema,
});
export type WorkflowCheckpoint = z.infer<typeof WorkflowCheckpointSchema>;

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
 * A run of a workflow: the aggregate of its per-phase stage runs, the phase
 * currently executing, and an overall status mapped to {@link WorkflowStateSchema}.
 */
/** Runner-captured result of a verify dispatch — real execution, never an agent claim. */
export const VerifyEvidenceSchema = z.object({
  phaseId: z.string().min(1),
  stageRunId: z.string().min(1),
  commands: z.array(z.string()),
  /** The check process's exit code; null when it never exited normally (spawn error / signal). */
  exitCode: z.number().int().nullable(),
  /** Full sha of the run branch HEAD the checks ran against (worktree runs only). */
  sha: z.string().min(1).optional(),
  cleanCheckout: z.boolean(),
  at: IsoDateTimeSchema,
});
export type VerifyEvidence = z.infer<typeof VerifyEvidenceSchema>;

export const WorkflowRunSchema = z.object({
  workflowRunId: z.string().min(1),
  workflowId: AgentIdSchema,
  /** Set on a sub-run: the parent run whose `workflow` phase started it. */
  parentRunId: z.string().min(1).optional(),
  /**
   * The parent side of a running sub-run: which phase waits on which child, plus what
   * the driver needs to re-enter that phase when the child settles (durable).
   */
  pendingChild: z
    .object({
      phaseId: z.string().min(1),
      childRunId: z.string().min(1),
      attempt: z.number().int().min(1),
      stageDir: z.string().min(1),
      handoffSource: z.string().nullable(),
    })
    .optional(),
  status: WorkflowStateSchema,
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
  startedAt: IsoDateTimeSchema,
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
   * Present while `parkedReason` is `output`: the index into the workflow's
   * `outputs` of the `pr` sink awaiting approval. On approve the runner resumes
   * output processing from here; durable across restart.
   */
  pendingOutput: z.object({ index: z.number().int().nonnegative() }).optional(),
  /**
   * P1-02/P1-03 — present while `parkedReason` is `gate` or `budget`: where the
   * driver re-enters on approve (`cursor` null = the chain is finished, deliver the
   * outputs) and the handoff the next phase consumes. No live child → durable.
   */
  pendingGate: z
    .object({
      phaseId: z.string().min(1),
      cursor: z.string().nullable(),
      handoffSource: z.string().nullable(),
    })
    .optional(),
  /**
   * P1-03 — the run's spend cap snapshot (from `workflow.budget`) and what it has
   * spent so far (model + external cost over every finished stage).
   */
  budget: z
    .object({
      maxCostUsd: z.number().positive(),
      warnAtPct: z.number().int().min(1).max(100),
      spentUsd: z.number().nonnegative(),
      warned: z.boolean().optional(),
    })
    .optional(),
  /**
   * Set when a `pr` output opened a PR (now Tier-2 — opened immediately as the run
   * finishes, no gate): the url + the branch's `+/−` line totals. Persisted on the
   * aggregate so the task outcome write-back can lift it onto the run view.
   */
  prOutput: PrOutputSchema.optional(),
  /**
   * A per-run override of the workflow definition's `outputs:`, set when a directed
   * task carried its own output choice (`createTask({ output })`). When present it
   * REPLACES `workflow.outputs` for this run only — the runner reads
   * `outputsOverride ?? workflow.outputs`. `[]` means the operator chose `void`
   * (suppress even a declared PR); absent means inherit the definition. Persisted so a
   * run parked mid-PR-gate resumes against the same sinks after a restart.
   */
  outputsOverride: z.array(WorkflowOutputSchema).optional(),
  /** Persisted per-phase retry counters, so a parked run resumes accurately. */
  retries: z.record(z.string(), z.number()).optional(),
  /**
   * Phase 9.3: the checkpoint commits the runner made on the run branch after each
   * green phase. Append-only; surfaces in the run detail and feeds the resume-context
   * a resumed/retried phase is prefixed with ("items 1–4 done and committed").
   */
  checkpoints: z.array(WorkflowCheckpointSchema).optional(),
  /**
   * Classifier terms (Phase 4) that routed the originating task here, persisted so
   * a parked/resumed run re-grounds each stage identically after a restart. They
   * drive memory-grounding MOC selection; absent for UI-started runs.
   */
  matchedTerms: z.array(z.string()).optional(),
  /**
   * Phase 12.6: the resolved check commands of the last `verify` phase that passed
   * in this run (runner-set from actual deterministic execution, never an agent
   * claim). Lets a goal whose maker IS this workflow skip a second, identical
   * verification when its own checks verifier would run the same commands. Absent
   * if the workflow has no verify phase or none passed.
   */
  verifyCommands: z.array(z.string()).optional(),
  /** Runner-captured evidence of the latest verify dispatch (exit code, sha, clean checkout). */
  verifyEvidence: VerifyEvidenceSchema.optional(),
  /** Why the dev → rel PR hop refused to open (e.g. missing/failed verify evidence). */
  prBlockedReason: z.string().optional(),
});
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;

/** Body accepted by `startWorkflowRun`. */
export const StartWorkflowRunSchema = z.object({
  project: z.string().optional(),
});
export type StartWorkflowRunInput = z.infer<typeof StartWorkflowRunSchema>;

/** Body accepted by `resumeWorkflowRun` — the operator's note for the retried phase. */
export const ResumeWorkflowRunSchema = z.object({
  note: z.string().optional(),
});
export type ResumeWorkflowRunInput = z.infer<typeof ResumeWorkflowRunSchema>;
