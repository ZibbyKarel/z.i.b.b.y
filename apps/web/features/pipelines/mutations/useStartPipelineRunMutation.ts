import { apiClient } from "../../../state/api";

/** Start a pipeline run (`POST /api/pipelines/:id/run`). */
export function useStartPipelineRunMutation() {
  return apiClient.pipelineRuns.startPipelineRun.useMutation();
}
