import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";
import { IntegrationIdSchema, IntegrationKindSchema } from "../integrations/integration.schema";
import { TaskOutcomeSchema } from "../tasks/task.schema";

/** The triage categories — shared by TriageVerdict and the Herald reply ledger (NS2 F6a). */
export const TriageCategorySchema = z.enum(["bug", "question", "request", "other"]);
export type TriageCategory = z.infer<typeof TriageCategorySchema>;

/**
 * Triage's verdict on one inbound item — the SHARED schema for 5.2/5.3. It is
 * `.strict()` ON PURPOSE (Law 4): triage runs over untrusted channel text, so the
 * verdict carries NO gate/approval/tier-override side channel. An unparseable or
 * extra-key verdict is rejected and the deterministic fallback takes over, exactly
 * like the task router. `tier` follows the autonomy contract (1 act-silently,
 * 2 act-then-report, 3 surface-and-wait); `confidence` below the floor escalates a
 * Claude verdict one tier, never lowers it.
 */
export const TriageVerdictSchema = z
  .object({
    actionable: z.boolean(),
    tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    category: TriageCategorySchema,
    /** Operator-template task text (Tier 1 dispatch); never executed as instructions. */
    suggestedTaskText: z.string().optional(),
    /** Draft reply (Tier 2/3); sent or parked as an approval, never auto-trusted. */
    suggestedReply: z.string().optional(),
    /**
     * One-line, operator-facing summary of the item (notify-only channels surface this
     * on the overview instead of dispatching). Triager-produced over untrusted text, so
     * it is length-capped and display-only — never executed or fed back as instructions.
     */
    summary: z.string().max(280).optional(),
    confidence: z.number().min(0).max(1),
    reason: z.string().max(2000),
  })
  .strict();
export type TriageVerdict = z.infer<typeof TriageVerdictSchema>;

/**
 * Lifecycle of a channel item; mutated only by the watcher/triage/approval paths.
 *
 * `needs-draft` (2026-08) sits between `new` and `triaged`: the item has been
 * triaged, but its reply draft is still being researched by the reply-draft
 * sweeper. NO approval exists in this state, so nothing is sendable — the item
 * only leaves it once a concrete draft exists (→ `triaged` with an `approvalId`)
 * or research gave up (→ `triaged`, notify-only, no approval).
 */
export const ChannelItemStateSchema = z.enum([
  "new",
  "needs-draft",
  "triaged",
  "handled",
  "ignored",
]);
export type ChannelItemState = z.infer<typeof ChannelItemStateSchema>;

/**
 * The reply-draft research marker. Doubles as the sweeper's in-flight lock:
 * `pending` is written BEFORE the child process spawns, so a slow research is
 * never double-spawned across ticks. `attempts` bounds the retry budget.
 */
export const DraftResearchSchema = z
  .object({
    status: z.enum(["pending", "ok", "failed"]),
    attempts: z.number().int().min(0),
    startedAt: IsoDateTimeSchema.optional(),
    finishedAt: IsoDateTimeSchema.optional(),
    /** Why research failed — operator-facing, display-only. */
    reason: z.string().max(500).optional(),
  })
  .strict();
export type DraftResearch = z.infer<typeof DraftResearchSchema>;

/** The channel-native identity an item came from (used for replies + dedup). */
export const ExternalRefSchema = z.object({
  channel: z.string().optional(),
  ts: z.string().optional(),
  threadTs: z.string().optional(),
  messageId: z.string().optional(),
});
export type ExternalRef = z.infer<typeof ExternalRefSchema>;

/**
 * A normalized inbound message. On disk: `data/channels/<integrationId>/<itemId>.json`.
 * `id` is DETERMINISTIC from the message identity (slack `<channel>-<ts>`, email
 * sha1 of Message-ID), so a re-polled message can never duplicate — dedup = id
 * collision. `text` is the sanitized, capped body; `raw` keeps the original payload
 * for the record. State + triage + links are stamped by the server only — there is
 * no client write path (Law 4: the API never lets a client forge a triaged state).
 */
export const ChannelItemSchema = z.object({
  id: z.string().min(1),
  integrationId: IntegrationIdSchema,
  kind: IntegrationKindSchema,
  externalRef: ExternalRefSchema,
  from: z.string().optional(),
  receivedAt: IsoDateTimeSchema,
  /** Sanitized, length-capped message text (never enters a prompt except enveloped). */
  text: z.string().max(4500),
  /** The original, untouched provider payload (kept for the audit record). */
  raw: z.unknown(),
  state: ChannelItemStateSchema,
  triage: TriageVerdictSchema.optional(),
  /**
   * The engagement this item was attributed to (Phase 8.2), matched server-side over
   * the sanitized text + integration name. Attribution only, never authorization —
   * it rides into the dispatched task's projectId and the inbox Tag, nothing more.
   */
  projectId: z.string().optional(),
  /** Stamped true when the sender matched a VIP person in the project profile. */
  vip: z.boolean().optional(),
  /** Set when a Tier-1 task was dispatched for this item. */
  taskId: z.string().optional(),
  /** Set when a Tier-3 reply was parked as an approval. */
  approvalId: z.string().optional(),
  /** Set once a reply was actually sent. */
  reply: z.object({ text: z.string(), sentAt: IsoDateTimeSchema }).optional(),
  /** Copied from the dispatched task's outcome once its run finishes (Tier 1). */
  outcome: TaskOutcomeSchema.optional(),
  /**
   * Phase 127 — a human-facing link back to this item's origin (a Jira issue, a
   * GitHub issue/PR, a Slack message), so the operator can open it in context.
   * Stamped only by adapters that can cheaply produce one at ingest time
   * (Jira, GitHub, Slack); other kinds simply omit it.
   */
  url: z.string().optional(),
  /** Set while / after the reply-draft sweeper researches an answer for this item. */
  draftResearch: DraftResearchSchema.optional(),
});
export type ChannelItem = z.infer<typeof ChannelItemSchema>;
