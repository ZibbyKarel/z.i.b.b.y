import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getAutomationsQueryKey } from "../queries/useAutomationsQuery";

/** Update an automation (enable/disable, retarget) (`PATCH /api/automations/:id`). */
export const useUpdateAutomationMutation = makeInvalidatingMutation(
  apiClient.automations.updateAutomation.useMutation,
  getAutomationsQueryKey,
);
