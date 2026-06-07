import { z } from "zod"
import { RiskSchema } from "../common.schema"

/** Which run kind an approval gates — so a decision can be routed to the right runner. */
export const ApprovalRunKindSchema = z.enum(["agent", "pipeline-stage"])
export type ApprovalRunKind = z.infer<typeof ApprovalRunKindSchema>

/** Lifecycle of an approval: created `pending`, then a human decides. */
export const ApprovalStatusSchema = z.enum(["pending", "approved", "rejected"])
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>

/**
 * A request for human sign-off before a gated action runs. Unifies the dashboard's
 * `Approval` (`id, skill, action, detail, risk`) with the link to the paused run
 * (`runId`, `kind`) and the decision lifecycle. Persisted durably so it survives
 * polling and a backend restart. Phase 3.5 generalises this into the gate engine's
 * richer `PendingApproval` (with `steps[]`); this stays the single-human-step case.
 */
export const ApprovalSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  kind: ApprovalRunKindSchema,
  /** The acting agent/skill name (the dashboard's `skill` field). */
  skill: z.string(),
  /** What it wants to do (e.g. "run", "git.push", "purchase"). */
  action: z.string(),
  /** Human-readable detail (e.g. the prompt). */
  detail: z.string(),
  risk: RiskSchema,
  status: ApprovalStatusSchema,
  requestedAt: z.string().datetime(),
  decidedAt: z.string().datetime().optional(),
})
export type Approval = z.infer<typeof ApprovalSchema>
