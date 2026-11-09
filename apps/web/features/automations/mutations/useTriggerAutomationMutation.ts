import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getAutomationsQueryKey } from "../queries/useAutomationsQuery";

/** Fire an automation now (`POST /api/automations/:id/trigger`); refreshes "last run". */
export const useTriggerAutomationMutation = makeInvalidatingMutation(
  apiClient.automations.triggerAutomation.useMutation,
  getAutomationsQueryKey,
);
