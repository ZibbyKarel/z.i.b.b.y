import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";
import { getCiStatusQueryKey } from "./keys";

// Re-exported so call sites resolve the key from here; the canonical home is the
// dependency-free `./keys` module (see its header).
export { getCiStatusQueryKey };

/**
 * CI status is genuinely polled STATE — the API itself refreshes it on the
 * `monitorTickMs` heartbeat, and a red→green recovery emits no SSE event (only
 * going red records a `monitor-alert`), so unlike run-scoped queries this one
 * keeps a slow interval even while the stream is up (the health/limits posture).
 */
const CI_STATUS_POLL_MS = 60 * 1000;

/**
 * Last known CI health for one project from `GET /api/monitors/status` (N4b) —
 * one entry per watched (integration × adapter). Going red refreshes instantly:
 * `runEvents` invalidates the key family on the `monitor-alert` activity entry;
 * the interval covers the silent green recovery.
 */
export function useCiStatusQuery(projectId: string) {
  return apiClient.monitors.listCiStatus.useQuery({
    queryKey: getCiStatusQueryKey(projectId),
    queryData: { query: { projectId } },
    refetchInterval: CI_STATUS_POLL_MS,
    retry: false,
    select: selectApiResponseBody,
  });
}
