import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getAgentsQueryKey } from "../queries/useAgentsQuery";

/** Patch an agent (`PATCH /api/agents/:id`); refreshes the catalog on success. */
export function useUpdateAgentMutation() {
  const qc = useQueryClient();
  return apiClient.agents.updateAgent.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getAgentsQueryKey() }),
  });
}
