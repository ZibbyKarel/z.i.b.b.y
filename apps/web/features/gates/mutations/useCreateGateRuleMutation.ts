import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getGateRulesQueryKey } from "../queries/useGateRulesQuery";

/** Add a rule to the global catalog (`POST /api/gate-rules`); appended to the end. */
export function useCreateGateRuleMutation() {
  const qc = useQueryClient();
  return apiClient.gateRules.createGateRule.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getGateRulesQueryKey() }),
  });
}
