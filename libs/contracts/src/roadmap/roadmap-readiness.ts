import type { RoadmapItem } from "./roadmap-item.schema";

/**
 * `blocked(item) = !item.overrideBlocked && item.dependsOn.some(id =>
 * get(id)?.lifecycle !== "done")`. A dependency that no longer resolves (a
 * dangling id, or one `get` simply doesn't know about) counts as NOT done —
 * `get(id)?.lifecycle` is `undefined` in that case, which is `!== "done"` —
 * so a missing dependency blocks rather than silently unblocking. Pure: takes
 * the lookup as a parameter rather than importing a store, so it has no I/O
 * and no zod runtime dependency (only the `RoadmapItem` type).
 */
export function isBlocked(
  item: RoadmapItem,
  get: (id: string) => RoadmapItem | undefined,
): boolean {
  if (item.overrideBlocked) return false;
  return item.dependsOn.some((id) => get(id)?.lifecycle !== "done");
}

/**
 * The board's five states. Four are columns (`ready`/`in-progress`/`done`,
 * `blocked` — BLOKOVANÉ first per the master plan); `archived` is not a
 * column at all — the board filters it out entirely (see DECISIONS.md D-004).
 */
export type RoadmapReadiness = "archived" | "blocked" | "ready" | "in-progress" | "done";

/**
 * Map an item + a dependency lookup to its board state. Order matters
 * (DECISIONS.md D-004): `done` first — a finished item stays finished even if
 * an edge is added to it later — then `archived`, then the derived `blocked`
 * check (checked before lifecycle, so a blocked-but-`enqueued` item reads as
 * BLOKOVANÉ rather than in-progress), then `enqueued`/`running`/
 * `awaiting-merge` → `in-progress`, and everything else (`todo`, `failed`) →
 * `ready`. `failed` deliberately maps to READY, not its own column: the
 * operator can act on it right now (Restart/Resume), and it still never
 * unblocks a dependent because `isBlocked` tests `lifecycle !== "done"`.
 */
export function readiness(
  item: RoadmapItem,
  get: (id: string) => RoadmapItem | undefined,
): RoadmapReadiness {
  if (item.lifecycle === "done") return "done";
  if (item.lifecycle === "archived") return "archived";
  if (isBlocked(item, get)) return "blocked";
  if (
    item.lifecycle === "enqueued" ||
    item.lifecycle === "running" ||
    item.lifecycle === "awaiting-merge"
  ) {
    return "in-progress";
  }
  return "ready";
}
