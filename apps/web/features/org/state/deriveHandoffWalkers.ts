import type { OrgFloorplanWalker } from "@zibby/design-system";

/** The slice of an employee the derivation reads. */
export interface HandoffEmployee {
  id: string;
  department: string;
  currentRunId?: string;
  currentTaskTitle?: string;
}

/**
 * A hand-off between departments, derived from two consecutive employee snapshots:
 * run R moved from employee A (leased it before, no longer) to employee B (leases it
 * now, did not before) and A and B sit in different departments. One walker per
 * (run, A, B) — id `${R}:${A}->${B}` — so a repeated poll never re-emits it.
 *
 * Honest-only: no previous snapshot, or no such lease movement → no walkers.
 */
export function deriveHandoffWalkers(
  previous: readonly HandoffEmployee[] | undefined,
  current: readonly HandoffEmployee[],
): OrgFloorplanWalker[] {
  if (!previous) return [];
  const prevByRun = new Map<string, HandoffEmployee[]>();
  for (const e of previous) {
    if (!e.currentRunId) continue;
    prevByRun.set(e.currentRunId, [...(prevByRun.get(e.currentRunId) ?? []), e]);
  }
  const prevRunOf = new Map(previous.map((e) => [e.id, e.currentRunId]));
  const currentRunOf = new Map(current.map((e) => [e.id, e.currentRunId]));

  const walkers = new Map<string, OrgFloorplanWalker>();
  for (const b of current) {
    const run = b.currentRunId;
    if (!run || prevRunOf.get(b.id) === run) continue;
    for (const a of prevByRun.get(run) ?? []) {
      if (a.id === b.id || a.department === b.department) continue;
      if (currentRunOf.get(a.id) === run) continue;
      const id = `${run}:${a.id}->${b.id}`;
      walkers.set(id, {
        id,
        agentId: a.id,
        toRoomId: b.department,
        label: b.currentTaskTitle ?? a.currentTaskTitle ?? run,
      });
    }
  }
  return [...walkers.values()];
}
