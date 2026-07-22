import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getHandoffRulesQueryKey } from "../queries/useHandoffRulesQuery";

/**
 * Remove an operator-authored handoff rule (`DELETE /api/handoff-rules/:id`) — a
 * system rule (`rule.system === true`) 403s server-side, so callers must never
 * offer this for one (see `HandoffRuleRow`'s delete-affordance gating).
 */
export const useDeleteHandoffRuleMutation = makeInvalidatingMutation(
  apiClient.handoff.deleteHandoffRule.useMutation,
  getHandoffRulesQueryKey,
);
