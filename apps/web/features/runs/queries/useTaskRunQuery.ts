import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";
import { useRunEventsConnected } from "../runEvents";
import { taskRunsRootKey } from "./keys";

/** Fallback poll interval used only when the SSE status channel is down. */
const TASK_RUN_POLL_MS = 1000;

/** Cache key for a single resolved run (`GET /api/tasks/runs/:runId`). */
export function getTaskRunQueryKey(runId: string) {
  return [...taskRunsRootKey, "one", runId] as const;
}

/**
 * Resolve ONE run by id, independent of any feed.
 *
 * Why it exists: `/archiv`'s own feed is server-filtered to SETTLED runs
 * (`ARCHIVED_STATES`), but `?run=<id>` deep links arrive from places that don't
 * know or care whether the run has finished — notably the roadmap item dialog's
 * "open run" affordance, which links an issue to a run that is usually still in
 * flight. Without this, such a link lands on the archive and silently selects
 * the newest archived row instead (`findSelectedRun` falls back to `list[0]`),
 * which is worse than showing nothing: it shows the WRONG run confidently.
 *
 * Keyed under `taskRunsRootKey` so the same SSE/mutation invalidations that
 * refresh the feeds refresh this too. `enabled` gates it on having an id, so a
 * screen can call it unconditionally (hook order) and pay nothing when the feed
 * already resolved the selection itself.
 */
export function useTaskRunQuery(runId: string | null) {
  const streamConnected = useRunEventsConnected();
  return apiClient.taskRuns.getTaskRun.useQuery({
    queryKey: getTaskRunQueryKey(runId ?? "none"),
    queryData: { params: { runId: runId ?? "" } },
    enabled: runId !== null,
    refetchInterval: streamConnected ? false : TASK_RUN_POLL_MS,
    select: selectApiResponseBody,
  });
}
