import { apiClient } from "../../../state/api";

/** Fire an automation now (`POST /api/automations/:id/trigger`). */
export function useTriggerAutomationMutation() {
  return apiClient.automations.triggerAutomation.useMutation();
}
