import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { allAgentRunsKey } from "../queries/useRunsQuery";

/** Stop a running agent run (`POST /api/agent-runs/:runId/stop`); refreshes the feed on success. */
export function useStopAgentMutation() {
  const qc = useQueryClient();
  return apiClient.agentRuns.stopRun.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: allAgentRunsKey }),
  });
}
