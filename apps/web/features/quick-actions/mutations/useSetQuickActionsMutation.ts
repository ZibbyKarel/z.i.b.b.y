import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getQuickActionsQueryKey } from "../queries/useQuickActionsQuery";

/** Replace the quick actions (`PUT /api/quick-actions`); refreshes them on success. */
export const useSetQuickActionsMutation = makeInvalidatingMutation(
  apiClient.quickActions.putQuickActions.useMutation,
  getQuickActionsQueryKey,
);
