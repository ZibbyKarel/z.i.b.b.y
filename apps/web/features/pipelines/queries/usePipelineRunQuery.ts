import { useRunEventsConnected } from "../../runs/runEvents";
import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for a single pipeline run (refreshed as it executes). */
export function getPipelineRunQueryKey(pipelineRunId: string) {
  return ["pipelineRun", pipelineRunId] as const;
}

/** Fallback poll interval used only when the SSE status channel is down. */
const PIPELINE_RUN_POLL_MS = 1000;

/**
 * Track a pipeline run's aggregate (`GET /api/tasks/runs/:runId`, resolved to the
 * owning pipeline runner) while it runs — used by the goal detail to render a
 * pipeline maker's stage timeline inline. The unified row is a `TaskRun`, so read
 * the pipeline fields off it (`owner` is the pipeline id, `processor.id` the same).
 * `enabled` gates the query on having an id. Freshness is push-driven: the
 * `/api/events` SSE channel invalidates this key on every aggregate transition. The
 * 1s poll is kept only as the fallback for when the stream is down.
 */
export function usePipelineRunQuery(pipelineRunId: string | null) {
  const streamConnected = useRunEventsConnected();
  return apiClient.taskRuns.getTaskRun.useQuery({
    queryKey: getPipelineRunQueryKey(pipelineRunId ?? "none"),
    queryData: { params: { runId: pipelineRunId ?? "" } },
    enabled: pipelineRunId !== null,
    refetchInterval: streamConnected ? false : PIPELINE_RUN_POLL_MS,
    select: selectApiResponseBody,
  });
}
