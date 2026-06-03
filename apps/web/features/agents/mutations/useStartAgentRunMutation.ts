import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getRunningAgentsQueryKey } from "../queries/useRunningAgentsQuery";

/** Start a run (`POST /api/agents/:id/run`); refreshes the running list on success. */
export function useStartAgentRunMutation() {
  const qc = useQueryClient();
  return apiClient.agentRuns.startRun.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getRunningAgentsQueryKey() }),
  });
}
