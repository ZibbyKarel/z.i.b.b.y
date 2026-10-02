import { useRunEventsConnected } from "../../runs/runEvents";
import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";
import { getWorkflowRunQueryKey } from "./keys";

// Re-exported so existing deep importers keep resolving the key from here; the
// canonical home is the dependency-free `./keys` module (see its header).
export { getWorkflowRunQueryKey };

/** Fallback poll interval used only when the SSE status channel is down. */
const WORKFLOW_RUN_POLL_MS = 1000;

/**
 * Track a workflow run's aggregate (`GET /api/tasks/runs/:runId`, resolved to the
 * owning workflow runner) while it runs — used by the goal detail to render a
 * workflow maker's stage timeline inline. The unified row is a `TaskRun`, so read
 * the workflow fields off it (`owner` is the workflow id, `processor.id` the same).
 * `enabled` gates the query on having an id. Freshness is push-driven: the
 * `/api/events` SSE channel invalidates this key on every aggregate transition. The
 * 1s poll is kept only as the fallback for when the stream is down.
 */
export function useWorkflowRunQuery(workflowRunId: string | null) {
  const streamConnected = useRunEventsConnected();
  return apiClient.taskRuns.getTaskRun.useQuery({
    queryKey: getWorkflowRunQueryKey(workflowRunId ?? "none"),
    queryData: { params: { runId: workflowRunId ?? "" } },
    enabled: workflowRunId !== null,
    refetchInterval: streamConnected ? false : WORKFLOW_RUN_POLL_MS,
    select: selectApiResponseBody,
  });
}
