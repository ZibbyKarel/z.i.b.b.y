import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getAgentsQueryKey } from "../queries/useAgentsQuery";

/** Create an agent (`POST /api/agents`); refreshes the catalog on success. */
export function useCreateAgentMutation() {
  const qc = useQueryClient();
  return apiClient.agents.createAgent.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getAgentsQueryKey() }),
  });
}
