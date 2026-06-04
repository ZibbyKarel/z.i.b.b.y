import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getAgentGatesQueryKey } from "../queries/useAgentGatesQuery";

/**
 * Replace an agent's own rules (`PUT /api/agents/:id/gates`). Harden-only — the
 * server returns 422 if a rule tries to weaken the locked floor.
 */
export function useReplaceAgentGatesMutation(id: string) {
  const qc = useQueryClient();
  return apiClient.gates.replaceAgentGates.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getAgentGatesQueryKey(id) }),
  });
}
