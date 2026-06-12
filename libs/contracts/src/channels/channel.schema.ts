import { z } from "zod"
import { IntegrationIdSchema, IntegrationKindSchema } from "../integrations/integration.schema"
import { TaskOutcomeSchema } from "../tasks/task.schema"

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
    category: z.enum(["bug", "question", "request", "other"]),
    /** Operator-template task text (Tier 1 dispatch); never executed as instructions. */
    suggestedTaskText: z.string().optional(),
    /** Draft reply (Tier 2/3); sent or parked as an approval, never auto-trusted. */
    suggestedReply: z.string().optional(),
    confidence: z.number().min(0).max(1),
    reason: z.string(),
  })
  .strict()
export type TriageVerdict = z.infer<typeof TriageVerdictSchema>

/** Lifecycle of a channel item; mutated only by the watcher/triage/approval paths. */
export const ChannelItemStateSchema = z.enum(["new", "triaged", "handled", "ignored"])
export type ChannelItemState = z.infer<typeof ChannelItemStateSchema>

/** The channel-native identity an item came from (used for replies + dedup). */
export const ExternalRefSchema = z.object({
  channel: z.string().optional(),
  ts: z.string().optional(),
  threadTs: z.string().optional(),
  messageId: z.string().optional(),
})
export type ExternalRef = z.infer<typeof ExternalRefSchema>

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
  receivedAt: z.string().datetime(),
  /** Sanitized, length-capped message text (never enters a prompt except enveloped). */
  text: z.string(),
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
  /** Set when a Tier-1 task was dispatched for this item. */
  taskId: z.string().optional(),
  /** Set when a Tier-3 reply was parked as an approval. */
  approvalId: z.string().optional(),
  /** Set once a reply was actually sent. */
  reply: z.object({ text: z.string(), sentAt: z.string().datetime() }).optional(),
  /** Copied from the dispatched task's outcome once its run finishes (Tier 1). */
  outcome: TaskOutcomeSchema.optional(),
})
export type ChannelItem = z.infer<typeof ChannelItemSchema>
