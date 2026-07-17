import { z } from "zod";
import { AvatarSchema, IsoDateTimeSchema } from "../common.schema";
import { AgentIdSchema } from "../agents/agent.schema";
import { MakerRefSchema, VerifierSpecSchema } from "../goals/goal.schema";
import { ProjectIdSchema } from "../projects/project.schema";
import { SubsystemIdSchema } from "../subsystems/subsystem.schema";

/**
 * Metadata for one uploaded attachment. The bytes live on disk under the set's dir
 * (`data/tasks/attachments/<setId>/`); this is only what the UI and the run manifest
 * need — original filename (basename), byte size, and the browser-reported MIME.
 */
export const AttachmentSchema = z.object({
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  mediaType: z.string().optional(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

/**
 * Display fields every routing target carries. `glyph` is a free-form string
 * (the API doesn't know the design system's `IconName` union, exactly as
 * `AgentSchema.glyph` is a plain string); the web client narrows it to an
 * `IconName` on receipt.
 */
const taskTargetDisplayShape = {
  name: z.string().min(1),
  glyph: z.string().optional(),
  /** Optional avatar (data URI or `/avatars/*.png` path); overrides the glyph in chat/HUD. */
  avatar: AvatarSchema.optional(),
  /** Free-form functional area, when the definition carries one. */
  category: z.string().optional(),
};

/** A stored agent as a routing destination. */
export const AgentTaskTargetSchema = z.object({
  kind: z.literal("agent"),
  id: AgentIdSchema,
  ...taskTargetDisplayShape,
});

/** A stored pipeline as a routing destination. */
export const PipelineTaskTargetSchema = z.object({
  kind: z.literal("pipeline"),
  id: AgentIdSchema,
  ...taskTargetDisplayShape,
});

/**
 * A stored goal as a routing destination (Phase 10). Like a pipeline it references
 * a stored definition (`id`), but it is NEVER auto-classified — the classifier only
 * routes to agent/pipeline/orchestrator. A goal-targeted task is created explicitly
 * (the goals contract) or by approving a `proposed-task`.
 */
export const GoalTaskTargetSchema = z.object({
  kind: z.literal("goal"),
  id: AgentIdSchema,
  ...taskTargetDisplayShape,
});

/**
 * A stored chain as a routing destination (Phase 05). Like a goal it references a
 * stored definition (`id`) but is NEVER auto-classified — the classifier only routes
 * to agent/pipeline/orchestrator. A chain-targeted task is created explicitly (the
 * Run button on `/chains/:id` prefills it into the New Task dialog).
 */
export const ChainTaskTargetSchema = z.object({
  kind: z.literal("chain"),
  id: AgentIdSchema,
  ...taskTargetDisplayShape,
});

/**
 * The terminal routing fallback: a single orchestrator session that has every
 * stored agent available as a delegatable subagent and can also do the task
 * directly — so a task always executes. It is synthetic (no stored definition),
 * hence no `id`; `name`/`glyph` exist purely so the dashboard can render it.
 */
export const OrchestratorTaskTargetSchema = z.object({
  kind: z.literal("orchestrator"),
  ...taskTargetDisplayShape,
});

/**
 * Phase 91 — a named subsystem as a routing destination (the `@`-mention /
 * "dispatch to Herald" case). Like goal/chain it is EXPLICIT-ONLY: the top-level
 * `TaskClassifierService` never emits this kind (scope guard — see
 * `docs/plans/phase-91-subsystem-dispatch.md`). It never reaches a stored run
 * record either — `TaskSchedulerService` resolves it to a concrete
 * `{ kind: "pipeline" }` target (the subsystem's one owned pipeline, or the
 * scoped classifier's pick among several) before dispatch, so a run's "via
 * <subsystem>" attribution rides for free on the dispatched pipeline's own
 * `Pipeline.ownerSubsystem` (Phase 81) — no new run-level field needed.
 */
export const SubsystemTaskTargetSchema = z.object({
  kind: z.literal("subsystem"),
  id: SubsystemIdSchema,
  ...taskTargetDisplayShape,
});

/**
 * A destination for a free-text task: a stored agent, a stored pipeline, a
 * named subsystem (Phase 91, explicit-only), or the orchestrator fallback.
 */
export const TaskTargetSchema = z.discriminatedUnion("kind", [
  AgentTaskTargetSchema,
  PipelineTaskTargetSchema,
  GoalTaskTargetSchema,
  ChainTaskTargetSchema,
  SubsystemTaskTargetSchema,
  OrchestratorTaskTargetSchema,
]);
export type TaskTarget = z.infer<typeof TaskTargetSchema>;
export type TaskTargetKind = TaskTarget["kind"];

/** A target that references a stored definition (has an `id`) — what the routers rank. */
export type CatalogTaskTarget = Extract<TaskTarget, { kind: "agent" | "pipeline" }>;

/**
 * Reserved owner id orchestrator runs carry as their `agentId` in the run feed.
 * Not a stored agent — a stored definition with this id would shadow it.
 */
export const ORCHESTRATOR_ID = "orchestrator";

/** The orchestrator's synthetic display identity (the dashboard renders these). */
export const ORCHESTRATOR_TARGET = {
  kind: "orchestrator",
  name: "Orchestrator",
  glyph: "compass",
} as const satisfies TaskTarget;

/**
 * Request body for the classifier: the free-text task plus any file/folder paths
 * the client already detected (strong routing hints — a `/media/…` path nudges
 * toward the media curator).
 */
export const ClassifyTaskInputSchema = z.object({
  text: z.string().min(1).max(8000),
  paths: z.array(z.string()).max(64).optional(),
});
export type ClassifyTaskInput = z.infer<typeof ClassifyTaskInputSchema>;

/**
 * Phase 11: how a classified task should EXECUTE. `single` is the default
 * agent/pipeline/orchestrator dispatch; `loop` means the task asked to
 * iterate-until-satisfied and the classifier synthesized a goal proposal. `mode`
 * is an orthogonal overlay on the routing — the `target` always stays the maker
 * (agent/pipeline/orchestrator); a synthesized loop has no stored goal id yet, so
 * it is NEVER a `target.kind: "goal"` at classify time (goal targets require a
 * persisted `.goal.md`). Persistence happens only on submit.
 */
export const TaskModeSchema = z.enum(["single", "loop"]);
export type TaskMode = z.infer<typeof TaskModeSchema>;

/**
 * Phase 11: a synthesized (un-persisted) goal definition the classifier proposes
 * when it detects a loop. It is the {@link CreateGoalInput} shape minus a committed
 * `id` — editable in the dialog's "Edit" disclosure before submit, then turned into
 * a real `<id>.goal.md` only when the operator confirms. The classifier writes
 * nothing; this is an in-memory proposal carried on the verdict.
 */
export const ProposedGoalSchema = z.object({
  objective: z.string().min(1),
  maker: MakerRefSchema,
  verifier: VerifierSpecSchema,
  maxIterations: z.number().int().positive(),
  instructions: z.string().min(1),
});
export type ProposedGoal = z.infer<typeof ProposedGoalSchema>;

/**
 * Phase 11: one of the task's detected paths resolved against the project registry
 * by the backend `matchProject` (Law 4 — read-only attribution). `project` is set
 * when the path lives inside a registered workspace root (→ the web shows
 * "scoped to <name>"); `null` when it is outside any project (→ the web offers a
 * gated "grant access" action that registers the folder). Resolution is
 * backend-only so the web never reimplements the diacritics-folded matcher.
 */
export const ResolvedPathSchema = z.object({
  path: z.string(),
  project: z.object({ id: ProjectIdSchema, name: z.string() }).nullable(),
});
export type ResolvedPath = z.infer<typeof ResolvedPathSchema>;

/**
 * The router verdict the approval gate renders: the chosen target, a 0–1
 * confidence, a short human reason, the catalog terms that matched, and the full
 * candidate list so the user can override the destination.
 *
 * Phase 11 adds three additive/optional fields (an old-shaped response still
 * parses, defaults applied): `mode` (`single` vs a synthesized `loop`),
 * `proposedGoal` (the loop's editable goal proposal, `null` for single mode), and
 * `paths` (each detected path resolved to a project or `null`).
 */
export const TaskRoutingSchema = z.object({
  target: TaskTargetSchema,
  /** 0–1; low values steer the user toward the manual picker. */
  confidence: z.number().min(0).max(1),
  /** One short human sentence explaining the choice. */
  reason: z.string(),
  /** Catalog terms that justified the match. */
  matchedTerms: z.array(z.string()),
  candidates: z.array(TaskTargetSchema).min(1),
  /** Phase 11: execute as a one-shot dispatch (`single`) or a synthesized loop. */
  mode: TaskModeSchema.default("single"),
  /** Phase 11: the synthesized goal proposal when `mode === "loop"`, else `null`. */
  proposedGoal: ProposedGoalSchema.nullable().default(null),
  /** Phase 11: detected paths resolved against the project registry. */
  paths: z.array(ResolvedPathSchema).default([]),
  /**
   * The classifier's advisory PROPOSAL of which of the target's `optionalTools`
   * look relevant to this task — a subset never invented outside that ceiling.
   * Advisory only: the operator's confirmed set (`CreateTaskInput.toolGrants`) is
   * independent of this and is what actually rides into dispatch. Defaults to
   * `[]` so an old-shaped response still parses.
   */
  toolGrants: z.array(z.string()).default([]),
});
export type TaskRouting = z.infer<typeof TaskRoutingSchema>;

/**
 * F2c — the persisted classification trace: the switchboard's STAGE-1 verdict
 * (the terminal unit that actually ran already lives on `ScheduledTask.target`/
 * `TaskRun.target`, so this is the "why", not a second target). `subsystem` is
 * set only when stage-1 delegated to a subsystem (a stage-2 `classifyWithinSubsystem`
 * call happened); absent when stage-1 already named a concrete agent/pipeline.
 * Optional/additive on both `ScheduledTask` and `TaskRun` — an old-shaped record
 * still parses with no trace, and the explicit `@mention` path never writes one
 * (nothing was actually classified).
 */
export const ClassificationTraceSchema = z.object({
  /** The switchboard's stage-1 pick — may itself be a `{kind:"subsystem"}` verdict. */
  stage1: TaskTargetSchema,
  /** 0–1; the stage-1 verdict's confidence. */
  confidence: z.number().min(0).max(1),
  /** The stage-1 verdict's one-sentence reason. */
  reason: z.string(),
  /** Catalog terms that justified the stage-1 pick. */
  matchedTerms: z.array(z.string()),
  /** Set when stage-1 delegated to a subsystem and stage-2 resolved the unit. */
  subsystem: SubsystemIdSchema.optional(),
});
export type ClassificationTrace = z.infer<typeof ClassificationTraceSchema>;

/**
 * What happens to a task's finished work — the operator's per-task choice in the
 * New Task dialog, the directed-task counterpart of a pipeline's `outputs:` block.
 * Like the pipeline sinks it is deterministic and system-owned (no agent, no
 * tokens); unlike them a task has no named `from` artifact, so the source is
 * implicit: a `pr` pushes the run's worktree branch, a `file` writes the run's
 * summary to the chosen destination.
 *
 *  - `pr`   — open a PR from the run's branch. Tier-2 (act-then-report): opened
 *             immediately when the run finishes, no approval gate. The url + line
 *             totals land on the outcome's {@link PrOutputSchema}.
 *  - `file` — write the result to a path in the project worktree (`dest: project`)
 *             or as a vault note (`dest: vault`). Tier-1, runs immediately.
 *  - `void` — explicitly produce no output (suppresses even a pipeline's own
 *             declared `pr` output for this run).
 *
 * ABSENT on a task (the field is `optional`) means *inherit*, NOT void: a
 * pipeline-routed task falls back to the pipeline's declared `outputs:`, an
 * agent/orchestrator task to today's behaviour (no terminal delivery). "Didn't
 * choose" and "chose void" are two distinct states.
 */
export const TaskOutputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pr") }),
  z.object({
    type: z.literal("file"),
    dest: z.enum(["project", "vault"]),
    to: z.string().min(1),
  }),
  z.object({ type: z.literal("void") }),
]);
export type TaskOutput = z.infer<typeof TaskOutputSchema>;

/**
 * The three delayed-start presets the New Task dialog offers. The wire format is
 * always the *resolved* absolute `scheduledAt` epoch ms (the client turns a preset
 * into a timestamp — `now` → null), so the backend never has to know preset
 * semantics; this enum is shared only so both ends name the choices the same way.
 */
export const SchedulePresetSchema = z.enum(["now", "in-1h", "limit-reset"]);
export type SchedulePreset = z.infer<typeof SchedulePresetSchema>;

/**
 * Lifecycle of a deferred task. It waits at `scheduled` until its `scheduledAt`,
 * when the scheduler classifies and dispatches it — to `dispatched` (carrying the
 * started run's `runRef`) or `failed` (carrying a short reason). A user may
 * `cancel` it while it is still waiting.
 *
 * Phase 8 adds two pre-dispatch holds for the per-engagement budget guard:
 * `held` (over a budget cap — parked behind a Tier-3 `spend-past-cap` approval)
 * and `queued` (at a project's `maxConcurrent` — FIFO bookkeeping, no approval).
 * Both release into `dispatched` once cleared; both are cancellable.
 */
export const ScheduledTaskStatusSchema = z.enum([
  "scheduled",
  "queued",
  "held",
  // The task was accepted and persisted, and its dispatch (Haiku titling + classify +
  // spawn) is running in the BACKGROUND — the interactive create path returns this
  // immediately so the New Task dialog can redirect to the run without waiting on the
  // spawn. It flips to `dispatched` once the run starts, or to `failed` if the
  // background dispatch can't route (no silent no-op — Law: a described task always
  // executes). Only the web dialog path produces it; server callers stay synchronous.
  "pending",
  "dispatched",
  "cancelled",
  "failed",
  // M8 dead-letter: a task whose dispatch threw a transient error and exhausted its
  // bounded retry/backoff budget. Terminal — distinct from `failed` (a one-shot or
  // permanent dispatch failure) so a repeatedly-failing task is surfaced for the
  // operator (briefing needs-you + a `task-dead-lettered` activity), never silent.
  "dead-letter",
  // The dispatched run finished `done` and the task's chosen `pr` output is now
  // waiting at the gate (a `task-output` approval) before the push. Durable — the
  // run already ended, so there is no live child; the task record IS the durable
  // state, so it survives a restart for free. Resolves to `dispatched` (the run's
  // outcome is written) once the operator approves or rejects the PR.
  "awaiting-output",
]);
export type ScheduledTaskStatus = z.infer<typeof ScheduledTaskStatusSchema>;

/**
 * The structured result of a task whose output opened a PR — the reference the run
 * detail's "Výstup úkolu" surface renders: the PR url plus the branch's line-change
 * totals (green/red counts, no diffstat body). Computed at PR-open time from
 * `git diff --numstat`; absent on non-PR outputs and every outcome predating it.
 */
export const PrOutputSchema = z.object({
  url: z.string().min(1),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
});
export type PrOutput = z.infer<typeof PrOutputSchema>;

/**
 * How a task's dispatched run ended: a terminal verdict plus a short, readable
 * summary (an agent run's last log line, or a pipeline's stage tally).
 */
export const TaskOutcomeSchema = z.object({
  status: z.enum(["done", "error"]),
  summary: z.string(),
  finishedAt: IsoDateTimeSchema,
  /**
   * Set when the task's `pr` output opened a PR (now Tier-2 — opened immediately, no
   * gate): the url + the branch's `+/−` line totals. The enrichment lifts it onto the
   * run view as `prOutput` so the detail shows just the link and the coloured counts.
   */
  pr: PrOutputSchema.optional(),
});
export type TaskOutcome = z.infer<typeof TaskOutcomeSchema>;

/**
 * A task whose dispatch was deferred to a future `scheduledAt`. Persisted as one
 * JSON file per id; the scheduler tick fires it when due (classify → start a run).
 */
export const ScheduledTaskSchema = z.object({
  id: z.string().min(1),
  /** Optional short human name; `""` when the user left it blank. */
  title: z.string().default(""),
  text: z.string().min(1).max(8000),
  paths: z.array(z.string()).default([]),
  /**
   * Phase 108: the operator's CONFIRMED tool-grant set, persisted so a
   * held/queued/pending/deferred task still carries it into the eventual
   * dispatch — mirrors how `paths`/`output` already travel. Intersected against
   * the resolved target's `optionalTools` ceiling SERVER-SIDE at dispatch time
   * (never trusted blindly). Defaults to `[]` so an old-shaped record still parses.
   */
  toolGrants: z.array(z.string()).default([]),
  /** Phase: the uploaded attachment set this task references (see AttachmentSchema). */
  attachmentSetId: z.string().optional(),
  /** Durable, displayable metadata for the referenced set (empty when none). */
  attachments: z.array(AttachmentSchema).default([]),
  /** Absolute epoch ms the task should fire at. */
  scheduledAt: z.number().int().positive(),
  status: ScheduledTaskStatusSchema,
  createdAt: IsoDateTimeSchema,
  /**
   * The engagement this task was attributed to (Phase 8), resolved
   * deterministically by `matchProject` before dispatch. Drives the budget guard,
   * the concurrency queue, briefing grouping and triage tagging. Attribution only,
   * never authorization (Law 4) — a matched project gains the task a label, nothing
   * more.
   */
  projectId: z.string().optional(),
  /** Set on `held`: why the budget guard parked it (e.g. "project-daily cap reached"). */
  heldReason: z.string().optional(),
  /**
   * Phase 9: set when the pre-dispatch limit guard re-deferred this task because the
   * usage window was exhausted. The task is re-persisted as `scheduled` with
   * `scheduledAt = resumeAt`, so the existing tick re-fires it when the window
   * resets — no new status. `"limit"` is the only value; absent on operator-scheduled
   * tasks, so the briefing/feed can tell "waiting on the window" from a chosen time.
   */
  deferredReason: z.enum(["limit"]).optional(),
  /** Phase 9: how many times the limit guard has re-deferred this task (diagnostic). */
  limitDeferrals: z.number().int().nonnegative().optional(),
  /** M8: how many times a transient dispatch error retried; at the cap the task dead-letters. */
  attempts: z.number().int().nonnegative().optional(),
  /** Set on `held`: the `spend-past-cap` approval gating the override. */
  approvalId: z.string().optional(),
  /** Set once dispatched: the classifier's chosen target. */
  target: TaskTargetSchema.optional(),
  /**
   * F2c — set once dispatched via the undirected classify path: the switchboard's
   * stage-1 verdict trace (see {@link ClassificationTraceSchema}). Absent for an
   * explicit target (nothing was classified) and for any pre-F2c record.
   */
  classification: ClassificationTraceSchema.optional(),
  /**
   * The operator's chosen terminal output (the dialog selector). Absent = inherit
   * (pipeline → its own `outputs:`, agent/orchestrator → none). Carried so the
   * dispatch and the terminal-state output gate both see the same choice.
   */
  output: TaskOutputSchema.optional(),
  /**
   * Set when an agent/orchestrator task parks at the `pr` output gate
   * (`status: "awaiting-output"`). Captured at terminal-`done` while the worktree
   * is provably alive, so the push at approval time can run from the repo against a
   * branch ref that outlives a reaped worktree (commit ≠ push). Cleared on resolve.
   */
  pendingOutput: z
    .object({
      /** The run branch to push (the work is already committed onto it). */
      branch: z.string().min(1),
      /** The git repo dir to push from (the worktree may be gone by approval time). */
      repoPath: z.string().min(1),
      /** The `task-output` approval gating the push. */
      approvalId: z.string().min(1),
      /** The PR title, composed at park time. */
      title: z.string().min(1),
      /**
       * The PR body, composed at park time (the run summary + the branch's diffstat).
       * Held here so the push needs neither the worktree nor a recomputed diff at
       * approval time — durable across restart and worktree cleanup.
       */
      body: z.string(),
    })
    .optional(),
  /** Set once dispatched: the started agent-run / pipeline-run id. */
  runRef: z.string().optional(),
  /** Set on `failed`: a short reason. */
  error: z.string().optional(),
  /**
   * Written back once the dispatched run reaches a terminal state. `status` is
   * the run's verdict (`interrupted` and a failed pipeline both map to `error`);
   * the task-level `status` enum is untouched — `failed` keeps meaning the
   * DISPATCH failed, while a dispatched run that errored lands here.
   */
  outcome: TaskOutcomeSchema.optional(),
});
export type ScheduledTask = z.infer<typeof ScheduledTaskSchema>;

/**
 * Request body for creating a task. `title` is an optional short name. A future
 * `scheduledAt` (absolute epoch ms) defers the task; a null/absent (or past) value
 * dispatches it immediately.
 */
export const CreateTaskInputSchema = z.object({
  title: z.string().max(200).optional(),
  text: z.string().min(1).max(8000),
  paths: z.array(z.string()).max(64).optional(),
  /** Phase: reference a previously-uploaded attachment set (POST /tasks/attachments). */
  attachmentSetId: z.string().optional(),
  scheduledAt: z.number().int().positive().nullish(),
  /**
   * The operator's chosen terminal output for this task (PR / file / void). Absent =
   * inherit (see {@link TaskOutputSchema}). The dialog selector sets it; the
   * scheduler threads it into dispatch and the terminal output gate.
   */
  output: TaskOutputSchema.optional(),
  /**
   * Phase 11: a pre-chosen dispatch target that bypasses classification — used by
   * the unified composer for a SCHEDULED loop, where the goal is created up front
   * and the task carries its `{ kind: "goal", id }` target so the scheduler's
   * defer/limit/budget machinery owns it (an immediate loop starts the goal run
   * directly instead). The scheduler already accepts an `explicitTarget`; this
   * threads it from the wire. Attribution stays server-derived (Law 4) — this is a
   * dispatch destination, not a project assertion.
   */
  target: TaskTargetSchema.optional(),
  /**
   * The operator's CONFIRMED tool-grant set for this run — independent of
   * `TaskRouting.toolGrants` (the classifier's advisory proposal). The New Task
   * composer pre-checks the proposal but the operator may edit it; this field is
   * what actually rides into dispatch and is intersected against the resolved
   * target's `optionalTools` ceiling server-side (never trusted blindly).
   */
  toolGrants: z.array(z.string()).optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;

/**
 * Outcome of `createTask`: the task was dispatched right away (→ a live run the
 * client can open), accepted with its dispatch still running in the background (→ a
 * `pending` task the client redirects to by id), or parked for later (→ the persisted
 * scheduled task). The interactive (dialog) path returns `pending`; synchronous
 * server callers return `dispatched`/`scheduled` exactly as before.
 */
export const CreateTaskResultSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("dispatched"),
    runRef: z.string().min(1),
    target: TaskTargetSchema,
    /** The persisted task record the run was born linked to (outcome lands on it). */
    task: ScheduledTaskSchema,
  }),
  z.object({
    outcome: z.literal("pending"),
    /**
     * The persisted `pending` task whose dispatch is running in the background. It has
     * no `runRef` yet — the client redirects to `/runs?run=<task.id>` and the feed
     * row flips from this task to its run in place (selection follows `taskId`).
     */
    task: ScheduledTaskSchema,
  }),
  z.object({
    outcome: z.literal("scheduled"),
    task: ScheduledTaskSchema,
  }),
]);
export type CreateTaskResult = z.infer<typeof CreateTaskResultSchema>;
