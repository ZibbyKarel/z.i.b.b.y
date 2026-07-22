import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getHandoffRulesQueryKey } from "../queries/useHandoffRulesQuery";

/**
 * Edit a handoff rule in place (`PUT /api/handoff-rules/:id`) — keeps its id and,
 * server-side, its `system` flag (a rule's `system` tag can never be flipped by an
 * update, even a system rule's own retune).
 */
export const useUpdateHandoffRuleMutation = makeInvalidatingMutation(
  apiClient.handoff.updateHandoffRule.useMutation,
  getHandoffRulesQueryKey,
);
