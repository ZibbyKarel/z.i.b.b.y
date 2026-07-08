import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";

/**
 * One open PR on the ZIBBY install repo's `origin`, as reported by `gh pr list`.
 * `url` is the direct GitHub link the operator follows to review/merge — the
 * whole reason this ships to the frontend.
 */
export const SelfPrSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  url: z.string(),
});
export type SelfPr = z.infer<typeof SelfPrSchema>;

/**
 * Phase 79 — the ZIBBY install repo's own freshness readout, backing the top-bar
 * indicator ("is ZIBBY up to date?"). `currentBranch`/`defaultBranch` are local
 * git state; `behind`/`ahead` are the commit counts vs. `origin/<defaultBranch>`
 * (0 when unknown — e.g. offline with no prior fetch, or not a git checkout at
 * all). `dirty` is `true` when the operator's tree has uncommitted changes —
 * `updateSelf` refuses to touch it. `upToDate` is `behind === 0`. `prs` is the
 * open PRs on the repo (via `gh pr list`) when the `gh` CLI is available
 * (`ghAvailable`); empty otherwise — never a failure. `fetchedAt` is when the
 * last successful `git fetch origin` completed (absent when offline or the
 * fetch never ran).
 */
export const SelfStatusSchema = z.object({
  currentBranch: z.string(),
  defaultBranch: z.string(),
  behind: z.number().int().nonnegative(),
  ahead: z.number().int().nonnegative(),
  dirty: z.boolean(),
  upToDate: z.boolean(),
  openPrCount: z.number().int().nonnegative(),
  prs: z.array(SelfPrSchema),
  fetchedAt: IsoDateTimeSchema.optional(),
  ghAvailable: z.boolean(),
});
export type SelfStatus = z.infer<typeof SelfStatusSchema>;

/**
 * Result of the operator-triggered `updateSelf` action (`git pull --ff-only`,
 * never `--force`/`reset`). `updated` is `false` with `behind: 0` both when
 * there was nothing to pull AND is not returned at all when the pull is refused
 * (that path is a 409 `ErrorSchema` instead — dirty tree or a non-fast-forward
 * history). `message` carries an optional human-readable note (e.g. "already
 * up to date", "not a git repository").
 */
export const SelfUpdateResultSchema = z.object({
  updated: z.boolean(),
  behind: z.number().int().nonnegative(),
  message: z.string().optional(),
});
export type SelfUpdateResult = z.infer<typeof SelfUpdateResultSchema>;
