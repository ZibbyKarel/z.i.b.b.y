import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getActivityViewQueryKey } from "../queries/useActivityViewQuery";

/** Replace the activity-log display config (`PUT /api/activity/view`); refreshes it. */
export function useSetActivityViewMutation() {
  const qc = useQueryClient();
  return apiClient.activityView.setActivityView.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getActivityViewQueryKey() }),
  });
}
