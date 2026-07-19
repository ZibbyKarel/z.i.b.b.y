import type { FeedStatus } from "./run";

/**
 * States that read as settled — finished, or otherwise done progressing on
 * their own — the archive vocabulary (D9, `docs/hud2chat/DECISIONS.md`).
 * Shared by `ChatTasksPanel`'s in-gutter "Archiv" link and the `/archiv` page
 * (F2) so the two surfaces read the same set rather than drifting into a
 * fourth vocabulary alongside `RUN_STATUS_GROUPS` (the project-summary tiles)
 * and `FILTER_BUCKETS` (the runs screen's header segments).
 *
 * Deliberately NOT the `done`/`error`/`parked` buckets of `RUN_STATUS_GROUPS`
 * taken wholesale: `paused-limit` sits in that module's `error` bucket (a
 * rate-limit pause reads as a failure for the runs screen's grouping) but is a
 * MID-RUN pause that auto-resumes once the limit clears, so it stays OUT of
 * the archive here — the one deliberate exception to "derive from
 * `RUN_STATUS_GROUPS`".
 */
export const ARCHIVED_STATES = new Set<FeedStatus>(["done", "error", "interrupted", "parked"]);

/** Whether `status` belongs in the archive rather than the active/live feed. */
export function isArchived(status: FeedStatus): boolean {
  return ARCHIVED_STATES.has(status);
}
