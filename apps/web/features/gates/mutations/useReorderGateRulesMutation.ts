import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getGateRulesQueryKey } from "../queries/useGateRulesQuery";

/**
 * Reorder the global catalog (`POST /api/gate-rules/reorder`). The order is the
 * evaluation order (first match wins), so it is a first-class operation — the body
 * is the full list of ids in the new order.
 */
export function useReorderGateRulesMutation() {
  const qc = useQueryClient();
  return apiClient.gateRules.reorderGateRules.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getGateRulesQueryKey() }),
  });
}
