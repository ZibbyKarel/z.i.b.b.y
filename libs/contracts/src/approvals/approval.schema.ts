import { z } from "zod"
import { RiskSchema } from "../common.schema"

/**
 * Which run kind an approval gates — so a decision can be routed to the right
 * runner. `channel` (Phase 5.3) gates a drafted reply to an inbound channel item;
 * the runId is a compound `<integrationId>/<itemId>` ref. `task` (Phase 8.1) gates
 * a budget overage: a task held over a per-engagement cap, where the runId is the
 * task id and approving it dispatches the task once, past the cap.
 */
export const ApprovalRunKindSchema = z.enum(["agent", "pipeline-stage", "channel", "task"])
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
