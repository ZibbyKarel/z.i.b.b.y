import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";
import { ProjectPrSchema } from "../projects/project-pr.schema";

/**
 * NS2 F5b — Maestro's read-side merge queue: every open PR across project
 * repos enriched with its CI/check state, review state, mergeability and age,
 * classified for an operator's "what can I merge now" glance. Read-only —
 * merging stays the operator's existing `POST /projects/:id/prs/:number/merge`
 * (`project-pr.service.ts`); this surface never writes to GitHub.
 */

/** Aggregated check/CI verdict for a PR head (GitHub check-runs rolled up).
 *  `unknown` = we couldn't read it (fail-open) — never treated as green. */
export const MergeCheckStateSchema = z.enum(["passing", "failing", "pending", "unknown"]);
export type MergeCheckState = z.infer<typeof MergeCheckStateSchema>;

/** Review verdict from the PR's reviews (latest-per-reviewer rollup). */
export const MergeReviewStateSchema = z.enum([
  "approved",
  "changes_requested",
  "review_required",
  "unknown",
]);
export type MergeReviewState = z.infer<typeof MergeReviewStateSchema>;

/** Maestro's classification of a PR's release-readiness (display only). */
export const MergeQueueStateSchema = z.enum(["ready", "blocked", "stale"]);
export type MergeQueueState = z.infer<typeof MergeQueueStateSchema>;

/**
 * One PR enriched for the merge queue — the read-side `ProjectPr` plus release
 * signals.
 *
 * Classification rules (`queueState`), applied in this order:
 * - `ready` = `checkState === "passing"` AND `reviewState === "approved"` AND
 *   `mergeable !== "conflicting"` AND `!draft`.
 * - `stale` = not `ready` AND `ageHours > 24*14` (2 weeks).
 * - `blocked` = everything else (failing/pending checks, changes requested,
 *   conflicts, draft, or an unenriched PR past the fan-out cap).
 */
export const MergeQueueEntrySchema = ProjectPrSchema.extend({
  projectId: z.string().min(1),
  projectName: z.string().optional(),
  repo: z.string(),
  checkState: MergeCheckStateSchema,
  reviewState: MergeReviewStateSchema,
  /** GitHub's own mergeability flag when known (clean/dirty/blocked → unknown). */
  mergeable: z.enum(["mergeable", "conflicting", "unknown"]),
  ageHours: z.number().nonnegative(),
  queueState: MergeQueueStateSchema,
});
export type MergeQueueEntry = z.infer<typeof MergeQueueEntrySchema>;

/**
 * The whole queue, newest-blocking-first within each bucket. Order: ready,
 * then blocked, then stale — the operator's "what can I merge now" glance.
 */
export const MergeQueueSchema = z.object({
  entries: z.array(MergeQueueEntrySchema),
  generatedAt: IsoDateTimeSchema,
});
export type MergeQueue = z.infer<typeof MergeQueueSchema>;

export const MergeQueueQuerySchema = z.object({ projectId: z.string().min(1).optional() });
export type MergeQueueQuery = z.infer<typeof MergeQueueQuerySchema>;
