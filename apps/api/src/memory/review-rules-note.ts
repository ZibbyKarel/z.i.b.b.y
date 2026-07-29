/**
 * Note ids for the learned review rules. They live in `memory/` (next to
 * `subsystem-shelf.ts`) rather than in `review-learning/` so `GroundingService`
 * can ground them without the memory module importing the review-learning module.
 *
 * A vault note id is a filesystem-safe BASENAME with no path separators —
 * `VaultService.scan()` derives it as `path.basename(file, ".md")`, never the
 * path relative to the vault root (see `docs/api/memory.md`'s "Note ID rules").
 * The two ids below sit at DIFFERENT depths on disk: `renderGlobal` writes the
 * cross-project note to the vault ROOT (`<vaultDir>/review-rules.md`), while
 * `render(projectId)` writes the per-project one a directory down
 * (`<vaultDir>/projects/<projectId>-review-rules.md`). Neither id encodes that —
 * both must stay a bare basename, the same shape `ProjectVaultService`'s own
 * `vault/projects/<id>.md` note uses (looked up as plain `<id>`, no `projects/`
 * prefix) — or `VaultService.note(id)` can never resolve it.
 */

/** The cross-project rules note — grounded into every work run. */
export const GLOBAL_REVIEW_RULES_ID = "review-rules";

/** One project's rules note — grounded only into that project's runs. */
export function reviewRulesIdFor(projectId: string): string {
  return `${projectId}-review-rules`;
}
