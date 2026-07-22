import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getHandoffRulesQueryKey } from "../queries/useHandoffRulesQuery";

/** Add an operator-authored handoff rule (`POST /api/handoff-rules`). */
export const useCreateHandoffRuleMutation = makeInvalidatingMutation(
  apiClient.handoff.createHandoffRule.useMutation,
  getHandoffRulesQueryKey,
);
