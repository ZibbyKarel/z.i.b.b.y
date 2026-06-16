import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for one whitelisted run artifact (the PR draft / diffstat / verdict). */
export function getRunArtifactQueryKey(pipelineRunId: string, name: string) {
  return ["taskRuns", "artifact", pipelineRunId, name] as const;
}

/**
 * Read one whitelisted run artifact
 * (`GET /api/tasks/runs/:runId/artifacts/:name`). Backs the PR-gate panel — the
 * `pr-draft.md` and `diffstat.txt` it shows are read once at park time (the run is
 * parked, nothing appends). A missing/off-allowlist artifact 404s; the panel keys
 * off `data` being absent and simply omits that block.
 */
export function useRunArtifactQuery(
  pipelineRunId: string,
  name: string,
  enabled = true,
) {
  return apiClient.taskRuns.getTaskRunArtifact.useQuery({
    queryKey: getRunArtifactQueryKey(pipelineRunId, name),
    queryData: { params: { runId: pipelineRunId, name } },
    enabled,
    // A 404 (artifact absent) is an expected state, not a retryable failure.
    retry: false,
    select: selectApiResponseBody,
  });
}
