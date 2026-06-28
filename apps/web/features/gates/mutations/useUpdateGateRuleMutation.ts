import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getGateRulesQueryKey } from "../queries/useGateRulesQuery";

/** Edit a catalog rule in place (`PUT /api/gate-rules/:id`); keeps its id and position. */
export const useUpdateGateRuleMutation = makeInvalidatingMutation(
  apiClient.gateRules.updateGateRule.useMutation,
  getGateRulesQueryKey,
);
