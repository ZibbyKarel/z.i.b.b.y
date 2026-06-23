import { useRunEventsConnected } from "../../runs/runEvents";
import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for the live pipeline-runs list. */
export function getPipelineRunsQueryKey() {
  return ["pipelineRuns", "live"] as const;
}

/** Fallback poll interval used only when the SSE status channel is down. */
const PIPELINE_RUNS_POLL_MS = 2000;

/**
 * The live pipeline-runs list (`GET /api/pipelines/runs`) — currently running
 * (and just-finished) runs. Backs the attempt counters on the detail canvas
 * while a run executes. Push-driven via the `/api/events` SSE channel; the poll is
 * the fallback for when the stream is down.
 */
export function usePipelineRunsQuery() {
  const streamConnected = useRunEventsConnected();
  return apiClient.pipelineRuns.listPipelineRuns.useQuery({
    queryKey: getPipelineRunsQueryKey(),
    refetchInterval: streamConnected ? false : PIPELINE_RUNS_POLL_MS,
    refetchIntervalInBackground: true,
    retry: false,
    select: selectApiResponseBody,
  });
}
