import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getGateRulesQueryKey } from "../queries/useGateRulesQuery";

/** Add a rule to the global catalog (`POST /api/gate-rules`); appended to the end. */
export const useCreateGateRuleMutation = makeInvalidatingMutation(
  apiClient.gateRules.createGateRule.useMutation,
  getGateRulesQueryKey,
);
