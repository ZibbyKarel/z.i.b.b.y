import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getActivityViewQueryKey } from "../queries/useActivityViewQuery";

/** Replace the activity-log display config (`PUT /api/activity/view`); refreshes it. */
export const useSetActivityViewMutation = makeInvalidatingMutation(
  apiClient.activityView.setActivityView.useMutation,
  getActivityViewQueryKey,
);
