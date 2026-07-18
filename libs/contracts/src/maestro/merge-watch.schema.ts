import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";

/**
 * NS2 F7b-2 — internal, file-backed only (no HTTP endpoint). A `MergeWatch` is
 * born the instant the operator's `mergeProjectPr` call actually merges a PR
 * with a known sha; `PostMergeWatchService` polls it until the merged sha's
 * target-branch CI resolves (or the bounded window expires):
 * - `watching` — the initial state, freshly recorded.
 * - `green` — CI passed; a silent Tier-1 outcome.
 * - `red` — CI failed; a gated fix task was dispatched (`taskId`), Tier-2
 *   act-then-report — the fix itself still ends at the ordinary PR gate.
 * - `expired` — the window closed before CI resolved either way.
 */
export const MergeWatchStateSchema = z.enum(["watching", "green", "red", "expired"]);
export type MergeWatchState = z.infer<typeof MergeWatchStateSchema>;

export const MergeWatchSchema = z.object({
  /** Deterministic id: `merge-<repo-slug>-<sha>`. */
  id: z.string().min(1),
  projectId: z.string().min(1),
  repo: z.string().min(1),
  sha: z.string().min(1),
  prNumber: z.number().int(),
  prTitle: z.string(),
  mergedAt: IsoDateTimeSchema,
  /** Stop watching after this instant (mergedAt + window). */
  deadline: IsoDateTimeSchema,
  attempts: z.number().int().nonnegative(),
  state: MergeWatchStateSchema,
  /** The fix task dispatched on a red verdict (links the loop's tail). */
  taskId: z.string().optional(),
});
export type MergeWatch = z.infer<typeof MergeWatchSchema>;
