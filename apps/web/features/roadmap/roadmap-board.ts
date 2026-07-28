import type { RoadmapItem, RoadmapReadiness } from "@zibby/contracts";
import { readiness } from "@zibby/contracts";

/** Build the `readiness()`/`isBlocked()` lookup from a project's full item list —
 * the one place a `Map` gets built, so every caller shares the same O(1) lookup
 * instead of re-deriving it (and instead of ever reimplementing `readiness`/
 * `isBlocked` themselves). */
export function buildRoadmapLookup(items: RoadmapItem[]): (id: string) => RoadmapItem | undefined {
  const byId = new Map(items.map((item) => [item.id, item] as const));
  return (id: string) => byId.get(id);
}

/** An epic's own tasks — level `"task"` whose `parentId` is this epic. */
export function epicChildren(items: RoadmapItem[], epicId: string): RoadmapItem[] {
  return items.filter((item) => item.level === "task" && item.parentId === epicId);
}

export interface EpicProgress {
  done: number;
  total: number;
}

/**
 * The epic row's progress bar input: children excluding `archived` ones — an item
 * the source stopped returning never counts toward "still to build here", the same
 * posture the board itself takes (D-004).
 */
export function epicProgress(items: RoadmapItem[], epicId: string): EpicProgress {
  const children = epicChildren(items, epicId).filter((c) => c.lifecycle !== "archived");
  return {
    total: children.length,
    done: children.filter((c) => c.lifecycle === "done").length,
  };
}

export type EpicStatus = "idea" | "todo" | "active" | "blocked" | "done";

/**
 * Aggregate an epic's own status pill from its children's `readiness()` — mirrors
 * the design mock's `epicStatus`, adapted to the four-column `readiness()`
 * vocabulary instead of the mock's fixture-only `todo|in_progress|done`.
 * `archived` children are excluded, same as {@link epicProgress}.
 */
export function epicStatus(
  items: RoadmapItem[],
  epicId: string,
  get: (id: string) => RoadmapItem | undefined,
): EpicStatus {
  const children = epicChildren(items, epicId).filter((c) => c.lifecycle !== "archived");
  if (children.length === 0) return "idea";
  const states = children.map((c) => readiness(c, get));
  if (states.every((s) => s === "done")) return "done";
  if (states.some((s) => s === "blocked")) return "blocked";
  if (states.some((s) => s === "in-progress" || s === "done")) return "active";
  return "todo";
}

/** The board's four columns, BLOKOVANÉ first (DECISIONS.md D-001). `archived` is
 * deliberately absent from this tuple — it is not a column at all (D-004). */
export const BOARD_COLUMNS: readonly Exclude<RoadmapReadiness, "archived">[] = [
  "blocked",
  "ready",
  "in-progress",
  "done",
];

export type BoardColumn = (typeof BOARD_COLUMNS)[number];

/**
 * Group an epic's children onto the four board columns via `readiness()`,
 * dropping `archived` items entirely (D-004) — they are kept on disk but never
 * rendered on the board, in any column.
 */
export function groupByColumn(
  children: RoadmapItem[],
  get: (id: string) => RoadmapItem | undefined,
): Record<BoardColumn, RoadmapItem[]> {
  const groups: Record<BoardColumn, RoadmapItem[]> = {
    blocked: [],
    ready: [],
    "in-progress": [],
    done: [],
  };
  for (const item of children) {
    const state = readiness(item, get);
    if (state === "archived") continue;
    groups[state].push(item);
  }
  return groups;
}

/**
 * This item's resolved blockers, in `dependsOn` order. A dangling id (`get`
 * can't resolve it) is dropped rather than rendered as a broken badge — the
 * item is still blocked by it (see `isBlocked`), it just has nothing to show.
 */
export function blockersOf(
  item: RoadmapItem,
  get: (id: string) => RoadmapItem | undefined,
): RoadmapItem[] {
  return item.dependsOn.map((id) => get(id)).filter((i): i is RoadmapItem => i !== undefined);
}

/** Every item (project-wide, not just this epic's siblings) whose `dependsOn`
 * names this item — the "blokuje N" side of the badge pair. */
export function dependentsOf(item: RoadmapItem, items: RoadmapItem[]): RoadmapItem[] {
  return items.filter((other) => other.dependsOn.includes(item.id));
}

/**
 * Deterministic per-epic hue. `RoadmapItem` has no `subsystem` concept (unlike the
 * design mock's fixture data, which hand-assigns each epic to one of five hard-coded
 * subsystems) — this hashes the epic's own `id` instead, so the same epic always
 * renders the same tint without inventing a field the schema doesn't have. Fixed
 * saturation/lightness keeps every hue reading at a similar weight against the dark
 * HUD background (only the hue angle varies).
 */
export function epicHue(epicId: string): string {
  let hash = 0;
  for (let i = 0; i < epicId.length; i++) {
    hash = (hash * 31 + epicId.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 62%)`;
}

/**
 * A short, single-line preview of a markdown body for a card/row: strips the
 * handful of markdown tokens that would otherwise show up as literal punctuation
 * once truncated (`#` headings, `*`/`_`/`` ` ``/`~` emphasis and code marks,
 * `[text](url)` links keep only their text) and collapses newlines to spaces.
 * Deliberately NOT a markdown parser — bounded, regex-only, never throws. The full
 * body always renders through the DS `Markdown` component in the detail dialog;
 * this is only ever a truncated preview, never the thing shown in full.
 */
export function stripMarkdownPreview(source: string): string {
  return source
    .replace(/\r?\n+/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .trim();
}
