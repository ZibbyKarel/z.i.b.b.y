import type { PipelineRunArtifact } from "@zibby/contracts";
import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for one whitelisted pipeline run artifact (the PR draft / diffstat). */
export function getRunArtifactQueryKey(pipelineRunId: string, name: string) {
  return ["pipelineRuns", "artifact", pipelineRunId, name] as const;
}

/**
 * Read one whitelisted run artifact
 * (`GET /api/pipelines/runs/:id/artifacts/:name`). Backs the PR-gate panel — the
 * `pr-draft.md` and `diffstat.txt` it shows are read once at park time (the run is
 * parked, nothing appends). A missing/off-allowlist artifact 404s; the panel keys
 * off `data` being absent and simply omits that block.
 */
export function useRunArtifactQuery(
  pipelineRunId: string,
  name: PipelineRunArtifact["name"],
  enabled = true,
) {
  return apiClient.pipelineRuns.getPipelineRunArtifact.useQuery({
    queryKey: getRunArtifactQueryKey(pipelineRunId, name),
    queryData: { params: { pipelineRunId, name } },
    enabled,
    // A 404 (artifact absent) is an expected state, not a retryable failure.
    retry: false,
    select: selectApiResponseBody,
  });
}
