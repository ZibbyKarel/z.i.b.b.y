import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getGateRulesQueryKey } from "../queries/useGateRulesQuery";

/** Remove a rule from the global catalog (`DELETE /api/gate-rules/:id`). */
export function useDeleteGateRuleMutation() {
  const qc = useQueryClient();
  return apiClient.gateRules.deleteGateRule.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getGateRulesQueryKey() }),
  });
}
