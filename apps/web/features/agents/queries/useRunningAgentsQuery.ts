import { useRunEventsConnected } from "../../runs/runEvents";
import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";
import { getRunningAgentsQueryKey } from "./keys";

// Re-exported so existing deep importers keep resolving the key from here; the
// canonical home is the dependency-free `./keys` module (see its header).
export { getRunningAgentsQueryKey };

/** Running runs are short-lived; poll often enough to feel live. */
const RUNNING_POLL_MS = 2_000;

/**
 * Live list of currently running (and just-finished) agent runs from
 * `GET /api/agents/running`. Returns the TanStack query result directly; `select`
 * unwraps the envelope so `data` is `AgentRun[]`. Backed by the shared
 * `["agents","running"]` cache.
 *
 * Freshness is push-driven: the unified `/api/events` SSE channel invalidates this
 * key on every run transition (see `RunEventsProvider`). Polling is only a
 * fallback for when that stream is down — while it's connected `refetchInterval`
 * is `false` (no timer at all). When it's not, the original self-gating poll
 * returns: a function returning `false` once no run is `status: "running"`, re-armed
 * by the start-run mutation's invalidation. Note `query.state.data` is the *raw*
 * `{ status, body }` envelope (`select` does not run on the cache), so the running
 * runs are read off `.body`.
 */
export function useRunningAgentsQuery() {
  const streamConnected = useRunEventsConnected();
  return apiClient.agentRuns.listRunning.useQuery({
    queryKey: getRunningAgentsQueryKey(),
    refetchInterval: streamConnected
      ? false
      : (query) => {
          const runs = query.state.data?.body ?? [];
          const anyRunning = runs.some((run) => run.status === "running");
          return anyRunning ? RUNNING_POLL_MS : false;
        },
    refetchIntervalInBackground: true,
    retry: false,
    select: selectApiResponseBody,
  });
}
