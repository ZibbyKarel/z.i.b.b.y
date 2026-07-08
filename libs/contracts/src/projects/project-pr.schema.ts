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
export const MergeProjectPrBodySchema = z.object({ method: MergeMethodSchema.optional() });
export type MergeProjectPrInput = z.infer<typeof MergeProjectPrBodySchema>;

/** Result of a merge attempt: whether GitHub actually merged it, and the PR's URL. */
export const MergeProjectPrResultSchema = z.object({
  merged: z.boolean(),
  url: z.string().optional(),
});
export type MergeProjectPrResult = z.infer<typeof MergeProjectPrResultSchema>;
