import { useRunEventsConnected } from "../../runs/runEvents";
import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";
import { getChainRunsQueryKey } from "./keys";

export { getChainRunsQueryKey };

/** Fallback cadence when the SSE channel is down — push covers the live path. */
const CHAIN_RUNS_POLL_MS = 5_000;

/**
 * Chain runs from `GET /api/chains/runs`. Freshness is push-driven: a chain
 * advances exactly when a pipeline run transitions, and `RunEventsProvider`
 * invalidates this key on every `pipeline-runs` SSE event — so the interval
 * exists ONLY while the stream is down (DNA: SSE for live streams).
 */
export function useChainRunsQuery() {
  const streamConnected = useRunEventsConnected();
  return apiClient.chainRuns.listChainRuns.useQuery({
    queryKey: getChainRunsQueryKey(),
    refetchInterval: streamConnected ? false : CHAIN_RUNS_POLL_MS,
    refetchIntervalInBackground: true,
    select: selectApiResponseBody,
  });
}
