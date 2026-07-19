import {
  ACTIVITY_GROUP_OF,
  type ActivityEntry,
  type ActivityGroup,
  type ActivityView,
} from "@zibby/contracts";

/**
 * One rendered row of the RightRail live log: either a single `visible` entry, or a
 * `group` row coalescing a consecutive run of `grouped`-mode entries of one group
 * into a count.
 */
export type ActivityLogRow =
  | { type: "entry"; key: string; entry: ActivityEntry }
  | { type: "group"; key: string; group: ActivityGroup; count: number; at: string };

/**
 * Turn the newest-first entry feed into log rows under the operator's view config:
 * `hidden` groups are dropped, consecutive `grouped` entries of the same group
 * collapse into one counted row (its `at` is the newest in the run), and `visible`
 * entries pass through one-per-row. A pure function — unit-tested, no rendering.
 */
export function buildActivityLog(entries: ActivityEntry[], view: ActivityView): ActivityLogRow[] {
  const rows: ActivityLogRow[] = [];
  let run: { group: ActivityGroup; count: number; at: string; firstId: string } | null = null;

  const flush = () => {
    if (!run) return;
    rows.push({
      type: "group",
      key: `grp-${run.firstId}`,
      group: run.group,
      count: run.count,
      at: run.at,
    });
    run = null;
  };

  for (const entry of entries) {
    const group = ACTIVITY_GROUP_OF[entry.kind];
    const mode = view[group];
    if (mode === "hidden") {
      flush();
      continue;
    }
    if (mode === "grouped") {
      if (run && run.group === group) {
        run.count += 1;
      } else {
        flush();
        run = { group, count: 1, at: entry.at, firstId: entry.id };
      }
      continue;
    }
    // visible
    flush();
    rows.push({ type: "entry", key: entry.id, entry });
  }
  flush();
  return rows;
}
