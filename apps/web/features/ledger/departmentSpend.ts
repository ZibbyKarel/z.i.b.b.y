import type { DepartmentId, TaskRun } from "@zibby/contracts";

/** One department's rollup for the Ledger's "today" reads (O-06). */
export interface DepartmentSpendToday {
  runs: number;
  spendUsd: number;
}

/** `YYYY-MM-DD` slice of an ISO timestamp — same UTC-day convention `ActivityLogService`
 *  cuts its daily log files on (`docs/api/activity.md`). */
function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Total spend today across EVERY run, regardless of a `department` stamp (the
 * Ledger spend screen's headline number) — the department-scoped rollup below
 * deliberately drops undepartmented runs, this one doesn't.
 */
export function totalSpendToday(runs: readonly TaskRun[], now: Date = new Date()): number {
  const today = dayOf(now.toISOString());
  let total = 0;
  for (const run of runs) {
    if (dayOf(run.startedAt) === today) total += run.costUsd ?? 0;
  }
  return total;
}

/**
 * O-06 — "runs today" + "spend today" per department, rolled up client-side from
 * the existing unified task-run feed (`GET /api/tasks/runs`, already the FULL
 * history newest-first — no separate endpoint needed). Per-department CAPS are not
 * built (O-06: the Ledger department table shows "—" for that column); this is
 * read-only. A run with no `department` stamp (pre-ZB-04a, or never routed to one)
 * is left out — it never attributes to a department's total.
 */
export function departmentSpendToday(
  runs: readonly TaskRun[],
  now: Date = new Date(),
): Map<DepartmentId, DepartmentSpendToday> {
  const today = dayOf(now.toISOString());
  const byDept = new Map<DepartmentId, DepartmentSpendToday>();
  for (const run of runs) {
    if (!run.department || dayOf(run.startedAt) !== today) continue;
    const row = byDept.get(run.department) ?? { runs: 0, spendUsd: 0 };
    row.runs += 1;
    row.spendUsd += run.costUsd ?? 0;
    byDept.set(run.department, row);
  }
  return byDept;
}
