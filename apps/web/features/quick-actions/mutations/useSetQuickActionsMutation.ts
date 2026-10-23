import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getQuickActionsQueryKey } from "../queries/useQuickActionsQuery";

/**
 * Replace the quick actions (`PUT /api/quick-actions`). On success the saved list is written
 * straight into the query cache (same `{ status, body }` envelope the query stores) so the next
 * edit starts from it, then the query is invalidated to confirm against the server.
 */
export function useSetQuickActionsMutation() {
  const queryClient = useQueryClient();
  return apiClient.quickActions.putQuickActions.useMutation({
    onSuccess: (response) => {
      queryClient.setQueryData(getQuickActionsQueryKey(), response);
      void queryClient.invalidateQueries({ queryKey: getQuickActionsQueryKey() });
    },
  });
}
