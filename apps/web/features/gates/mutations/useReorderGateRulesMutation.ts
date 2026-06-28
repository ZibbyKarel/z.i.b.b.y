import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getGateRulesQueryKey } from "../queries/useGateRulesQuery";

/**
 * Reorder the global catalog (`POST /api/gate-rules/reorder`). The order is the
 * evaluation order (first match wins), so it is a first-class operation — the body
 * is the full list of ids in the new order.
 */
export const useReorderGateRulesMutation = makeInvalidatingMutation(
  apiClient.gateRules.reorderGateRules.useMutation,
  getGateRulesQueryKey,
);
