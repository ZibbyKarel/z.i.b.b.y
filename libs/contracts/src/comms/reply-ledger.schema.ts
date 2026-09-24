import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";
import { TriageCategorySchema } from "../channels/channel.schema";
import { IntegrationIdSchema, IntegrationKindSchema } from "../integrations/integration.schema";

/**
 * Outcome of one drafted reply. `sent-auto` = a Tier-2 gated auto-send (already-
 * graduated / mandate-on path). `approved` = a Tier-3 parked draft the operator
 * approved UNEDITED and it was sent. `rejected` = parked draft rejected (resets the
 * graduation streak). `pending` = parked, awaiting the operator. `edited` is RESERVED
 * (no edit-on-approve path exists in v1 — never produced; forward-compat only).
 */
export const ReplyLedgerOutcomeSchema = z.enum([
  "pending",
  "sent-auto",
  "approved",
  "rejected",
  "edited",
]);
export type ReplyLedgerOutcome = z.infer<typeof ReplyLedgerOutcomeSchema>;

/** One drafted reply recorded for the record — draft → operator decision. */
export const ReplyLedgerEntrySchema = z.object({
  id: z.string().min(1),
  integrationId: IntegrationIdSchema,
  kind: IntegrationKindSchema,
  projectId: z.string().optional(),
  itemId: z.string().min(1),
  approvalId: z.string().optional(),
  category: TriageCategorySchema,
  confidence: z.number().min(0).max(1),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  outcome: ReplyLedgerOutcomeSchema,
  proposedAt: IsoDateTimeSchema,
  decidedAt: IsoDateTimeSchema.optional(),
});
export type ReplyLedgerEntry = z.infer<typeof ReplyLedgerEntrySchema>;

/** A graduated (channel, category) pair — Tier-3 → Tier-2 auto-send, evidence-backed. */
export const HeraldGraduationSchema = z.object({
  integrationId: IntegrationIdSchema,
  kind: IntegrationKindSchema,
  category: TriageCategorySchema,
  projectId: z.string().optional(),
  evidenceCount: z.number().int().positive(),
  approvalId: z.string().min(1),
  graduatedAt: IsoDateTimeSchema,
});
export type HeraldGraduation = z.infer<typeof HeraldGraduationSchema>;
