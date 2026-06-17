import { z } from "zod"

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
  "briefing-generated",
  // M6 (research / intelligence, Tier 1 — silent + recorded). A digest pass ran and
  // mirrored its result to the vault; the morning briefing reads the digest note.
  "research-digest",
  // M8 (hardening). An integration poll exhausted its retry/backoff budget — surfaced
  // (not just stamped as lastError) so a persistently failing channel never fails silently.
  "integration-retry-exhausted",
  // M8 (hardening). A task's dispatch exhausted its retry budget and was dead-lettered —
  // surfaced in the briefing's needs-you so a repeatedly-failing task never fails silently.
  "task-dead-lettered",
  // M6 (proposes app ideas, Tier 1 — silent + recorded). A weekly pass paired interests
  // with trends into prototype pitches in the vault; the morning briefing surfaces them.
  "app-ideas-generated",
])
export type ActivityKind = z.infer<typeof ActivityKindSchema>

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
    /** The engagement an entry is attributed to (Phase 8) — grouping, not authz. */
    projectId: z.string().optional(),
    approvalId: z.string().optional(),
    integrationId: z.string().optional(),
    itemId: z.string().optional(),
    action: z.string().optional(),
    decision: z.string().optional(),
    status: z.string().optional(),
    noteId: z.string().optional(),
  })
  .strict()
export type ActivityRefs = z.infer<typeof ActivityRefsSchema>

/**
 * One append-only line of the accountability record. `summary` is the single
 * human-readable sentence the feed renders verbatim; `traceId`/`runId` are stamped
 * from the active trace scope so every entry is correlated for free (the same
 * AsyncLocalStorage the logger reads). Born only inside the API process — there is
 * no client write path, so the record can never be forged.
 */
export const ActivityEntrySchema = z.object({
  id: z.string().min(1),
  at: z.string().datetime(),
  kind: ActivityKindSchema,
  summary: z.string(),
  traceId: z.string().optional(),
  runId: z.string().optional(),
  refs: ActivityRefsSchema,
})
export type ActivityEntry = z.infer<typeof ActivityEntrySchema>

/** The accepted `date` shape — validated in the handler so a bad value is a 422. */
export const ACTIVITY_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Query for `GET /api/activity`. `date` defaults to today (server-side); `kinds`
 * is a comma-separated allow-list of {@link ActivityKind}; `limit` is clamped to
 * [1, 500]. `date` is a plain string here (not regex-gated) so a malformed value
 * reaches the handler and maps to a 422 rather than ts-rest's generic 400.
 */
export const ActivityQuerySchema = z.object({
  date: z.string().optional(),
  kinds: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
})
export type ActivityQuery = z.infer<typeof ActivityQuerySchema>
