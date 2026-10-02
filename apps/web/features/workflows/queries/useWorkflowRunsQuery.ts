import { useRunEventsConnected } from "../../runs/runEvents";
import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for the live workflow-runs list. */
export function getWorkflowRunsQueryKey() {
  return ["workflowRuns", "live"] as const;
}

/** Fallback poll interval used only when the SSE status channel is down. */
const WORKFLOW_RUNS_POLL_MS = 2000;

/**
 * The live workflow-runs list (`GET /api/workflows/runs`) — currently running
 * (and just-finished) runs. Backs the attempt counters on the detail canvas
 * while a run executes. Push-driven via the `/api/events` SSE channel; the poll is
 * the fallback for when the stream is down.
 */
export function useWorkflowRunsQuery() {
  const streamConnected = useRunEventsConnected();
  return apiClient.workflowRuns.listWorkflowRuns.useQuery({
    queryKey: getWorkflowRunsQueryKey(),
    refetchInterval: streamConnected ? false : WORKFLOW_RUNS_POLL_MS,
    refetchIntervalInBackground: true,
    retry: false,
    select: selectApiResponseBody,
  });
}
