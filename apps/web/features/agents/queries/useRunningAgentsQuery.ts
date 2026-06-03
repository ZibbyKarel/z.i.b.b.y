import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/**
 * Shared cache key for the live running-agents list. Exported so the run
 * mutations can target it for invalidation.
 */
export function getRunningAgentsQueryKey() {
  return ["agents", "running"] as const;
}

/** Running runs are short-lived; poll often enough to feel live. */
const RUNNING_POLL_MS = 2_000;

/**
 * Live list of currently running (and just-finished) agent runs from
 * `GET /api/agents/running`. Polls on an interval — the payload is one-directional
 * and slowly-changing, so a `refetchInterval` beats SSE (same call the limits and
 * health panels make). Returns the TanStack query result directly; `select` unwraps
 * the envelope so `data` is `AgentRun[]`. Backed by the shared `["agents","running"]`
 * cache.
 *
 * Polling is self-gating: `refetchInterval` is a function returning `false` once no
 * run is `status: "running"`, so an idle list stops the timer instead of hammering
 * the API. The `useStartAgentRunMutation` invalidation re-arms it — a forced refetch
 * re-runs this predicate, which sees the new running run and resumes polling. Note
 * `query.state.data` here is the *raw* `{ status, body }` envelope (`select` does not
 * run on the cache), so the running runs are read off `.body`.
 */
export function useRunningAgentsQuery() {
  return apiClient.agentRuns.listRunning.useQuery({
    queryKey: getRunningAgentsQueryKey(),
    refetchInterval: (query) => {
      const runs = query.state.data?.body ?? [];
      const anyRunning = runs.some((run) => run.status === "running");
      return anyRunning ? RUNNING_POLL_MS : false;
    },
    refetchIntervalInBackground: true,
    retry: false,
    select: selectApiResponseBody,
  });
}
