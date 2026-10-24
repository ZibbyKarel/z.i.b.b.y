import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";

/** Max length of a proposal's producer text and the operator's edited text. */
export const PROPOSAL_TEXT_MAX = 500;

/** Days a proposal stays listed after the last producer run that still saw it. */
export const PROPOSAL_TTL_DAYS = 30;

/**
 * The automations that write proposal records (TODO 14). A closed vocabulary,
 * extended on purpose when a new producer plugs into `ProposalsService.upsert`.
 */
export const ProposalSourceSchema = z.enum(["pattern-extract", "gap-detect", "agent-factory"]);
export type ProposalSource = z.infer<typeof ProposalSourceSchema>;

/** Evidence strength against the producer's own minimum occurrence count `m`. */
export const ProposalConfidenceSchema = z.enum(["low", "medium", "high"]);
export type ProposalConfidence = z.infer<typeof ProposalConfidenceSchema>;

/** `dismissed` is terminal — a producer rerun never re-opens it. */
export const ProposalStatusSchema = z.enum(["open", "dismissed"]);
export type ProposalStatus = z.infer<typeof ProposalStatusSchema>;

/** Where a proposal came from — every link optional, the object strict (Law 4 hygiene). */
export const ProposalProvenanceSchema = z
  .object({
    automationId: z.string().optional(),
    noteId: z.string().optional(),
    approvalId: z.string().optional(),
    agentId: z.string().optional(),
  })
  .strict();
export type ProposalProvenance = z.infer<typeof ProposalProvenanceSchema>;

/**
 * One structured system proposal (TODO 14). `id` is a stable short hash of
 * `source` + the producer's dedupe key, so a rerun updates the record instead
 * of duplicating it. `editedText` (the operator's wording) wins over `text`
 * (the producer's current wording) everywhere it is shown or written.
 */
export const ProposalSchema = z.object({
  id: z.string().min(1),
  source: ProposalSourceSchema,
  text: z.string().max(PROPOSAL_TEXT_MAX),
  editedText: z.string().max(PROPOSAL_TEXT_MAX).optional(),
  confidence: ProposalConfidenceSchema,
  occurrences: z.number().int().min(0),
  provenance: ProposalProvenanceSchema,
  createdAt: IsoDateTimeSchema,
  lastSeenAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema,
  status: ProposalStatusSchema,
  decidedAt: IsoDateTimeSchema.optional(),
});
export type Proposal = z.infer<typeof ProposalSchema>;

/** `PATCH /api/proposals/:id` body — dismiss, or replace the wording (1–500 chars after trim). */
export const DecideProposalInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("dismiss") }),
  z.object({
    action: z.literal("edit"),
    text: z.string().trim().min(1).max(PROPOSAL_TEXT_MAX),
  }),
]);
export type DecideProposalInput = z.infer<typeof DecideProposalInputSchema>;
