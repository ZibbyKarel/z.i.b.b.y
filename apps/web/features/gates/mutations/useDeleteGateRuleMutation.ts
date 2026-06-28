import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getGateRulesQueryKey } from "../queries/useGateRulesQuery";

/** Remove a rule from the global catalog (`DELETE /api/gate-rules/:id`). */
export const useDeleteGateRuleMutation = makeInvalidatingMutation(
  apiClient.gateRules.deleteGateRule.useMutation,
  getGateRulesQueryKey,
);
