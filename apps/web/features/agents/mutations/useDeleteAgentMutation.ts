import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getAgentsQueryKey } from "../queries/useAgentsQuery";

/** Delete an agent (`DELETE /api/agents/:id`); refreshes the catalog on success. */
export function useDeleteAgentMutation() {
  const qc = useQueryClient();
  return apiClient.agents.deleteAgent.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getAgentsQueryKey() }),
  });
}
