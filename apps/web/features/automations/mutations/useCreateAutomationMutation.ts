import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getAutomationsQueryKey } from "../queries/useAutomationsQuery";

/** Create an automation (`POST /api/automations`). */
export const useCreateAutomationMutation = makeInvalidatingMutation(
  apiClient.automations.createAutomation.useMutation,
  getAutomationsQueryKey,
);
