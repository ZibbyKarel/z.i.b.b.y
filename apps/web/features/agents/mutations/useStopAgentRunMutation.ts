import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getRunningAgentsQueryKey } from "../queries/useRunningAgentsQuery";

/** Stop a run (`POST /api/agents/runs/:runId/stop`); refreshes the running list. */
export function useStopAgentRunMutation() {
  const qc = useQueryClient();
  return apiClient.agentRuns.stopRun.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getRunningAgentsQueryKey() }),
  });
}
