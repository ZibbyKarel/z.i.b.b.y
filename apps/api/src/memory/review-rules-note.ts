/**
 * Note ids for the learned review rules. They live in `memory/` (next to
 * `subsystem-shelf.ts`) rather than in `review-learning/` so `GroundingService`
 * can ground them without the memory module importing the review-learning module.
 */

/** The cross-project rules note — grounded into every work run. */
export const GLOBAL_REVIEW_RULES_ID = "review-rules";

/** One project's rules note — grounded only into that project's runs. */
export function reviewRulesIdFor(projectId: string): string {
  return `projects/${projectId}-review-rules`;
}
