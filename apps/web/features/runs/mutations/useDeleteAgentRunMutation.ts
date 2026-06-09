import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { allAgentRunsKey } from "../queries/useRunsQuery";

/** Delete an agent run (`DELETE /api/agent-runs/:runId`); erases its on-disk
 * artifacts and refreshes the feed on success. */
export function useDeleteAgentRunMutation() {
  const qc = useQueryClient();
  return apiClient.agentRuns.deleteRun.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: allAgentRunsKey }),
  });
}
