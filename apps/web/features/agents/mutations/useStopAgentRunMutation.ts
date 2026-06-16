import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { allTaskRunsKey } from "../../runs/queries/useRunsQuery";
import { getRunningAgentsQueryKey } from "../queries/useRunningAgentsQuery";

/**
 * Stop a running agent run through the unified surface
 * (`POST /api/tasks/runs/:runId/stop`); refreshes both the catalog-liveness
 * "running agents" list and the unified runs feed on success.
 */
export function useStopAgentRunMutation() {
  const qc = useQueryClient();
  return apiClient.taskRuns.stopTaskRun.useMutation({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getRunningAgentsQueryKey() });
      qc.invalidateQueries({ queryKey: allTaskRunsKey });
    },
  });
}
