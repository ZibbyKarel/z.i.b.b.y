import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getAutomationsQueryKey } from "../queries/useAutomationsQuery";

/** Delete an automation (`DELETE /api/automations/:id`; the server 409s system ones). */
export const useDeleteAutomationMutation = makeInvalidatingMutation(
  apiClient.automations.deleteAutomation.useMutation,
  getAutomationsQueryKey,
);
