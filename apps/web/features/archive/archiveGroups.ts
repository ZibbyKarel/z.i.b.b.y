import type { SubsystemId } from "@zibby/contracts";
import { SUBSYSTEMS } from "@zibby/contracts";
import { isArchived } from "../runs/archiveStatus";
import { type RunView, runTitle } from "../runs/run";
import { type OwnerSubsystemMaps, runSubsystemId } from "../subsystems/useOwnerSubsystem";

/**
 * Pure grouping/filtering logic for the `/archiv` page (F2,
 * `docs/plans/hud2chat-F2-archive.md`, decision D3). No i18n and no React here —
 * `Screen.tsx` resolves every group's display label (a subsystem's `name`, the
 * "bez subsystému" fallback, or a time-bucket's translated copy) at render time,
 * so this module only ever hands back stable ids.
 */

/** Pseudo id for a run with no subsystem attribution — an agent/goal run (which
 * has no subsystem concept at all, D8), or a pipeline/chain run whose owner
 * isn't tagged. Kept selectable in the filter and groupable on its own, rather
 * than silently dropped. */
export const NO_SUBSYSTEM = "none" as const;
export type ArchiveSubsystemFilterId = SubsystemId | typeof NO_SUBSYSTEM;

export type ArchiveGroupMode = "subsystem" | "time";

export type TimeBucket = "today" | "yesterday" | "week" | "older";

/** Design's bucket order (`design/Z.I.B.B.Y/ZIBBY Archiv úloh.html`'s `AR_GROUP_ORDER`). */
export const TIME_BUCKET_ORDER: readonly TimeBucket[] = ["today", "yesterday", "week", "older"];

export interface ArchiveGroup {
  /** A `SubsystemId`, {@link NO_SUBSYSTEM}, or a {@link TimeBucket} — the caller
   * knows which, since it picked the grouping mode. */
  id: string;
  /** Set only in subsystem-mode groups (the registry's per-subsystem hex), for
   * the group header's coloured dot. Absent for time-mode groups and the
   * "bez subsystému" bucket. */
  color?: string;
  items: RunView[];
}

/** Whether `run`'s title or project matches the free-text search — the only two
 * fields the design's search box matches against (`arFilter`). Empty/blank
 * query always matches. */
export function matchesArchiveSearch(run: RunView, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return runTitle(run).toLowerCase().includes(q) || run.project.toLowerCase().includes(q);
}

/** The subsystem-filter identity of a run — its real subsystem, or the explicit
 * {@link NO_SUBSYSTEM} bucket (D8). */
export function archiveSubsystemFilterId(
  run: Pick<RunView, "kind" | "owner">,
  ownerMaps: OwnerSubsystemMaps,
): ArchiveSubsystemFilterId {
  return runSubsystemId(run, ownerMaps) ?? NO_SUBSYSTEM;
}

/** The archived (D9), search-matched, subsystem-filtered rows for the master
 * list — `subsystemFilter` empty means "all subsystems" (the design's default),
 * matching any non-empty selection means only those ids. */
export function filterArchiveRuns(
  runs: readonly RunView[],
  query: string,
  subsystemFilter: readonly ArchiveSubsystemFilterId[],
  ownerMaps: OwnerSubsystemMaps,
): RunView[] {
  return runs.filter((r) => {
    if (!isArchived(r.status)) return false;
    if (!matchesArchiveSearch(r, query)) return false;
    if (
      subsystemFilter.length > 0 &&
      !subsystemFilter.includes(archiveSubsystemFilterId(r, ownerMaps))
    ) {
      return false;
    }
    return true;
  });
}

/** Per-subsystem (+ {@link NO_SUBSYSTEM}) counts for the multi-select's trailing
 * numbers — computed from the archived + search-matched set, but BEFORE the
 * subsystem selection itself is applied, so picking one subsystem doesn't zero
 * out every other option's count. */
export function computeSubsystemCounts(
  runs: readonly RunView[],
  query: string,
  ownerMaps: OwnerSubsystemMaps,
): Partial<Record<ArchiveSubsystemFilterId, number>> {
  const counts: Partial<Record<ArchiveSubsystemFilterId, number>> = {};
  for (const r of runs) {
    if (!isArchived(r.status) || !matchesArchiveSearch(r, query)) continue;
    const id = archiveSubsystemFilterId(r, ownerMaps);
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

/** Group already-filtered rows by subsystem: one group per {@link SUBSYSTEMS}
 * entry that has rows (registry order), then {@link NO_SUBSYSTEM} last — only
 * when it actually has rows (mirrors the design's `arGroup`, which drops empty
 * buckets entirely). */
export function groupBySubsystem(
  runs: readonly RunView[],
  ownerMaps: OwnerSubsystemMaps,
): ArchiveGroup[] {
  const by = new Map<ArchiveSubsystemFilterId, RunView[]>();
  for (const r of runs) {
    const id = archiveSubsystemFilterId(r, ownerMaps);
    const list = by.get(id);
    if (list) list.push(r);
    else by.set(id, [r]);
  }

  const groups: ArchiveGroup[] = [];
  for (const s of SUBSYSTEMS) {
    const items = by.get(s.id);
    if (items && items.length > 0) groups.push({ id: s.id, color: s.color, items });
  }
  const none = by.get(NO_SUBSYSTEM);
  if (none && none.length > 0) groups.push({ id: NO_SUBSYSTEM, items: none });
  return groups;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Which of the design's four time buckets `startedAt` falls into, relative to
 * `now` (a render-stable timestamp — see `Screen.tsx`'s own `now` state,
 * mirroring `AktivitaTab`/the runs `Screen`'s established pattern). */
export function timeBucket(startedAt: string, now: number): TimeBucket {
  const started = new Date(startedAt).getTime();
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  if (started >= startOfToday) return "today";
  if (started >= startOfToday - DAY_MS) return "yesterday";
  if (started >= startOfToday - 7 * DAY_MS) return "week";
  return "older";
}

/** Group already-filtered rows by {@link TIME_BUCKET_ORDER}, dropping empty
 * buckets (mirrors `groupBySubsystem`'s "only non-empty groups" rule). */
export function groupByTime(runs: readonly RunView[], now: number): ArchiveGroup[] {
  const by = new Map<TimeBucket, RunView[]>();
  for (const r of runs) {
    const bucket = timeBucket(r.startedAt, now);
    const list = by.get(bucket);
    if (list) list.push(r);
    else by.set(bucket, [r]);
  }
  return TIME_BUCKET_ORDER.filter((b) => (by.get(b)?.length ?? 0) > 0).map((b) => ({
    id: b,
    items: by.get(b) ?? [],
  }));
}

/** Dispatch to {@link groupBySubsystem} or {@link groupByTime} by the active
 * {@link ArchiveGroupMode} — the one place `Screen.tsx` needs to branch on it. */
export function groupArchiveRuns(
  mode: ArchiveGroupMode,
  runs: readonly RunView[],
  ownerMaps: OwnerSubsystemMaps,
  now: number,
): ArchiveGroup[] {
  return mode === "subsystem" ? groupBySubsystem(runs, ownerMaps) : groupByTime(runs, now);
}
