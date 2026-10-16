import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";

/**
 * Phase 78 — one open GitHub pull request on a project's linked repo, as shown
 * on the project detail's PR overview. A thin, UI-facing projection of the
 * GitHub REST `pulls` shape (`number`/`title`/`html_url`→`url`/`user.login`→
 * `author`/`head.ref`→`branch`/`draft`/`created_at`→`createdAt`) — never the raw
 * GitHub payload, so the wire shape stays stable if GitHub's changes.
 */
export const ProjectPrSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  url: z.string(),
  author: z.string().optional(),
  branch: z.string().optional(),
  draft: z.boolean(),
  createdAt: IsoDateTimeSchema.optional(),
});
export type ProjectPr = z.infer<typeof ProjectPrSchema>;

/**
 * GitHub's three merge strategies — the operator's choice on the merge button
 * (defaults to the repo's own default when omitted, same as leaving GitHub's
 * merge-method dropdown untouched).
 */
export const MergeMethodSchema = z.enum(["merge", "squash", "rebase"]);
export type MergeMethod = z.infer<typeof MergeMethodSchema>;

/** Body accepted by `mergeProjectPr` — every field optional (a bare merge click). */
export const MergeProjectPrBodySchema = z.object({
  method: MergeMethodSchema.optional(),
  /**
   * Phase 129 P3 — delete the head branch after a successful merge. Skipped for a
   * fork (head repo != base repo); a failed delete never fails the merge (see `note`).
   */
  deleteBranch: z.boolean().optional(),
});
export type MergeProjectPrInput = z.infer<typeof MergeProjectPrBodySchema>;

/** Result of a merge attempt: whether GitHub actually merged it, and the PR's URL. */
export const MergeProjectPrResultSchema = z.object({
  merged: z.boolean(),
  url: z.string().optional(),
  /** NS2 F7b-2 — the merge commit sha on the base branch, for the post-merge CI watch. */
  sha: z.string().optional(),
  /** Phase 129 P3 — true when the head branch was deleted after the merge. */
  branchDeleted: z.boolean().optional(),
  /** Phase 129 P3 — why a requested branch delete was skipped or failed (the merge itself succeeded). */
  note: z.string().optional(),
});
export type MergeProjectPrResult = z.infer<typeof MergeProjectPrResultSchema>;
