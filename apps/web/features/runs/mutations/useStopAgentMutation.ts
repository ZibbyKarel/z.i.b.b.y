import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { allTaskRunsKey } from "../queries/useRunsQuery";

/** Stop a running agent run (`POST /api/tasks/runs/:runId/stop`); refreshes the feed on success. */
export function useStopAgentMutation() {
  const qc = useQueryClient();
  return apiClient.taskRuns.stopTaskRun.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: allTaskRunsKey }),
  });
}
