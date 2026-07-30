import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";
import { RoutingAlternativeSchema, TaskTargetSchema } from "../tasks/task.schema";
import { RoadmapItemIdSchema } from "./roadmap-item.schema";

/**
 * NS2 F10 — the parked payload for a Tier-3 **routing** handoff: the switchboard
 * could not tell whose domain an autonomously-released roadmap item belongs to, so
 * instead of guessing it parks this and asks.
 *
 * Same store shape as `HandoffProposal` (one `<id>.json`, write-once / read-once /
 * removed either way — no `update`), and gated the same way: a
 * `routing-proposal` approval whose `runId` IS this proposal's id, since there is
 * no live child to pause. `RoadmapGateService` writes it; `RoutingProposalService`
 * resolves it.
 *
 * Carries BOTH candidates rather than only the winner, because the whole point of
 * parking is that the two were too close to separate unattended — the operator
 * needs to see the choice that was actually in front of the classifier. Note the
 * approval itself is binary (approve = release with `pick`, reject = leave the item
 * in the operator's hands): `ApprovalsService` has no pick-one-of-N primitive, so
 * the alternative is surfaced as information, not as a second button.
 */
export const RoutingProposalSchema = z.object({
  id: z.string().min(1),
  /** The project whose roadmap item is parked. */
  projectId: z.string().min(1),
  /** The parked roadmap item — put back to `todo` while this proposal is pending. */
  itemId: RoadmapItemIdSchema,
  /** The task text the classifier was asked to route (verbatim; Law 4 — data). */
  text: z.string(),
  /** The resolved project worktree path the release would have used. */
  projectPath: z.string().min(1),
  /** The stage-1 winner — what an approval releases the item to. */
  pick: TaskTargetSchema,
  /** The winner's own confidence, kept for the record (never re-thresholded). */
  confidence: z.number().min(0).max(1),
  /** Why the winner won, as the router put it. */
  reason: z.string(),
  /** The second-best pick that made this ambiguous; `null` when the winner was simply weak. */
  runnerUp: RoutingAlternativeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type RoutingProposal = z.infer<typeof RoutingProposalSchema>;
