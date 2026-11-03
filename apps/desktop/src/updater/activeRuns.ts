/** Statuses whose work dies with the API process. Everything else is on disk and resumes. */
const BUSY_STATUSES = new Set(["running", "pending"]);

export function countBusyRuns(runs: unknown): number {
  if (!Array.isArray(runs)) return 0;
  return runs.filter((run) => {
    const status = (run as { status?: unknown } | null)?.status;
    return typeof status === "string" && BUSY_STATUSES.has(status);
  }).length;
}

/**
 * How many runs a restart would interrupt right now. An unreachable API counts as
 * zero: nothing it isn't serving can be protected by waiting for it.
 */
export async function fetchBusyRunCount(apiBaseUrl: string): Promise<number> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/tasks/runs`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return 0;
    return countBusyRuns(await res.json());
  } catch {
    return 0;
  }
}
