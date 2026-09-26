import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getBudgetConfigQueryKey } from "../queries/useBudgetConfigQuery";

/** Replace the global pause/warn thresholds (`PUT /api/budget/config`); refreshes them. */
export const useUpdateBudgetConfigMutation = makeInvalidatingMutation(
  apiClient.budget.updateBudgetConfig.useMutation,
  getBudgetConfigQueryKey,
);
