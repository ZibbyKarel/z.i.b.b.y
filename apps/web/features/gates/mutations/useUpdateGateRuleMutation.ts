import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getGateRulesQueryKey } from "../queries/useGateRulesQuery";

/** Edit a catalog rule in place (`PUT /api/gate-rules/:id`); keeps its id and position. */
export function useUpdateGateRuleMutation() {
  const qc = useQueryClient();
  return apiClient.gateRules.updateGateRule.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getGateRulesQueryKey() }),
  });
}
