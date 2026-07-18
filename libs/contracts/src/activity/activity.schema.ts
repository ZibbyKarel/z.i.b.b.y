import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";
import { SubsystemIdSchema } from "../subsystems/subsystem.schema";

/**
 * The closed vocabulary of recordable activity (Phase 6.1). One kind per real,
 * operator-relevant event in the autonomy machinery — the roadmap's list
 * (dispatch, gate decision, channel action, run transitions, briefing) and nothing
 * more. A noisy feed destroys 6.3's meaning, so this enum is the WHOLE alphabet:
 * a new kind is added here explicitly, never smuggled through a free-form field.
 */
export const ActivityKindSchema = z.enum([
  "task-created",
  "task-dispatched",
  "task-outcome",
  "task-held",
  "task-queued",
  "run-started",
  "run-finished",
  "pipeline-started",
  "pipeline-finished",
  "pipeline-parked",
  // Phase 45 (qualify gate, Tier 1 — silent + recorded). A `qualify` agent phase's
  // parsed verdict (pass/gap/drift): pass advances, gap/drift loop the work back. The
  // briefing reads the eventual run finish; the verdict surfaces on the stage timeline.
  "stage-verdict",
  // Phase 9 (limit resilience, Tier 1 — silent + recorded). A run halted on the
  // subscription usage limit, auto-resumed when the window reset, or a task was
  // re-deferred because the window was exhausted at dispatch. None notify; the
  // briefing reads the pause/resume off the live run state + the eventual finish.
  "run-paused-limit",
  "run-resumed-limit",
  "task-deferred-limit",
  // Phase 10 (loop engine, Tier 1 — silent + recorded). A goal dispatched a maker
  // iteration, a verifier returned a verdict, or a goal parked (bounded effort
  // exhausted). None notify on their own; a parked goal rides the parked
  // notification, the briefing reads in-flight/paused goals off the live state.
  "goal-dispatched",
  "goal-verdict",
  "goal-parked",
  "approval-requested",
  "approval-approved",
  "approval-rejected",
  "gate-decision",
  "channel-item",
  "channel-triage",
  "channel-reply",
  "channel-approval",
  "channel-ignored",
  // Read-only integrations (calendar) produce inbound items but have no reply surface;
  // the item is noted as handled silently rather than parked in the approval queue.
  "channel-noted",
  // Notify-only channels (email): an inbound item was surfaced for the operator's
  // attention — ZIBBY flagged it (reply/decision needed) but took no action itself.
  "channel-needs-attention",
  "briefing-generated",
  // M8 (hardening). An integration poll exhausted its retry/backoff budget — surfaced
  // (not just stamped as lastError) so a persistently failing channel never fails silently.
  "integration-retry-exhausted",
  // N3 (CI/CD monitoring, Tier 1/2). A monitor ingested a status alert (a red CI run)
  // and dispatched the investigation task riding its `taskId` ref — act-then-report:
  // the fix run surfaces on the runs feed and, when parked at the PR gate, in needs-you.
  "monitor-alert",
  // N5a: an approved machine action was executed (or failed) — the gate's
  // act-then-report line; the proposal itself rides approval-requested.
  "machine-action",
  // M8 (hardening). A task's dispatch exhausted its retry budget and was dead-lettered —
  // surfaced in the briefing's needs-you so a repeatedly-failing task never fails silently.
  "task-dead-lettered",
  // N2b (pipeline chaining, Tier 1 — silent + recorded). An operator-authored chain
  // started, handed an artifact to its next step, parked on a broken/gated handoff,
  // or reached a terminal state (done/failed — the `status` ref carries which).
  "chain-started",
  "chain-advanced",
  "chain-parked",
  "chain-finished",
  // Phase 4a (Agent Factory telemetry, Tier 1 — silent + recorded). The task
  // classifier's terminal rule routed a task to the orchestrator because nothing
  // in the catalog matched confidently (never an explicit target override). The
  // Agent Factory's detector groups these by `refs.normalizedSummary` — repeated
  // escapes are the signal a missing specialist agent would resolve.
  "orchestrator-fallback",
  // NS2 F5a/F5c — a subsystem watcher completed a scheduled scan (Tier-1, silent +
  // recorded): new findings rode a proposal note; a critical one dispatched a gated task.
  "subsystem-scan",
  // NS2 F7b-2. An operator-merged PR (through ZIBBY's gated endpoint) — the merge
  // loop's head; the post-merge watch rides its sha.
  "merge-completed",
  // NS2 F7b-2. The merged sha's target-branch CI resolved (green: silent Tier-1;
  // red: a gated fix task dispatched, riding taskId) or the watch window expired.
  "post-merge-outcome",
]);
export type ActivityKind = z.infer<typeof ActivityKindSchema>;

/**
 * The structured links an activity entry may carry — every field an OPTIONAL
 * string, the object `.strict()` (Law 4 hygiene applied to the record itself): an
 * entry can never smuggle a gate/approval/tier side channel through a free-form
 * payload. If a new kind needs a new ref, this schema grows on purpose.
 */
export const ActivityRefsSchema = z
  .object({
    taskId: z.string().optional(),
    runRef: z.string().optional(),
    pipelineId: z.string().optional(),
    agentId: z.string().optional(),
    /** Phase 10: the goal run and goal definition a goal-loop entry is attributed to. */
    goalRunId: z.string().optional(),
    goalId: z.string().optional(),
    /** N2b: the chain run and chain definition a chain entry is attributed to. */
    chainRunId: z.string().optional(),
    chainId: z.string().optional(),
    /** The engagement an entry is attributed to (Phase 8) — grouping, not authz. */
    projectId: z.string().optional(),
    approvalId: z.string().optional(),
    integrationId: z.string().optional(),
    itemId: z.string().optional(),
    action: z.string().optional(),
    decision: z.string().optional(),
    status: z.string().optional(),
    noteId: z.string().optional(),
    /**
     * Phase 4a (Agent Factory telemetry): the normalized task summary an
     * `orchestrator-fallback` entry carries — the same lowercase/punctuation-
     * stripped grouping key `GapDetectorService` uses for `task-created`, so the
     * detector can tally recurring escapes without re-deriving it.
     */
    normalizedSummary: z.string().optional(),
    /** Comma-joined classifier-matched terms carried alongside `normalizedSummary`. */
    terms: z.string().optional(),
    /**
     * F2c: the subsystem that owns the dispatched unit (its `Pipeline`/`Agent`
     * `ownerSubsystem`), stamped on a dispatch entry when known — best-effort
     * attribution, not authorization (Law 4). Absent when the target is
     * unattributed (e.g. the orchestrator fallback) or the store read failed.
     */
    ownerSubsystem: SubsystemIdSchema.optional(),
  })
  .strict();
export type ActivityRefs = z.infer<typeof ActivityRefsSchema>;

/**
 * One append-only line of the accountability record. `summary` is the single
 * human-readable sentence the feed renders verbatim; `traceId`/`runId` are stamped
 * from the active trace scope so every entry is correlated for free (the same
 * AsyncLocalStorage the logger reads). Born only inside the API process — there is
 * no client write path, so the record can never be forged.
 */
export const ActivityEntrySchema = z.object({
  id: z.string().min(1),
  at: IsoDateTimeSchema,
  kind: ActivityKindSchema,
  summary: z.string(),
  traceId: z.string().optional(),
  runId: z.string().optional(),
  refs: ActivityRefsSchema,
});
export type ActivityEntry = z.infer<typeof ActivityEntrySchema>;

/** The accepted `date` shape — validated in the handler so a bad value is a 422. */
export const ACTIVITY_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Query for `GET /api/activity`. `date` defaults to today (server-side); `kinds`
 * is a comma-separated allow-list of {@link ActivityKind}; `limit` is clamped to
 * [1, 500]. `date` is a plain string here (not regex-gated) so a malformed value
 * reaches the handler and maps to a 422 rather than ts-rest's generic 400.
 *
 * `projectId`/`integrationId` filter by the entry's `refs` (used by the per-project
 * integration-activity log). When either is given the server reads a multi-day
 * window (`days`, default 14, clamped to [1, 90]) instead of just today, so a sparse
 * processing history is still visible; `date` then takes precedence if also given.
 */
export const ActivityQuerySchema = z.object({
  date: z.string().optional(),
  kinds: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  projectId: z.string().optional(),
  integrationId: z.string().optional(),
  days: z.coerce.number().int().min(1).max(90).optional(),
});
export type ActivityQuery = z.infer<typeof ActivityQuerySchema>;

/**
 * Query for `GET /api/activity/page` — keyset (cursor) pagination over the WHOLE
 * on-disk history, newest-first, spanning day-file boundaries. The RightRail live
 * log reads through this and an infinite query: the first page is the newest
 * entries, each `nextCursor` walks strictly further back. `before` is an opaque
 * cursor (`<at>|<id>` of the previous page's oldest entry); `limit` is clamped to
 * [1, 200]. `kinds` is accepted for symmetry but the rail filters client-side.
 */
export const ActivityPageQuerySchema = z.object({
  before: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  kinds: z.string().optional(),
});
export type ActivityPageQuery = z.infer<typeof ActivityPageQuerySchema>;

/**
 * One page of the activity log. `entries` are newest-first; `nextCursor` is the
 * opaque cursor to pass back as `before` for the following (older) page, or `null`
 * when the history is exhausted.
 */
export const ActivityPageSchema = z.object({
  entries: z.array(ActivityEntrySchema),
  nextCursor: z.string().nullable(),
});
export type ActivityPage = z.infer<typeof ActivityPageSchema>;
