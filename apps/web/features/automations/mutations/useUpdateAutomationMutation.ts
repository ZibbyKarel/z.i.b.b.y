import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getAutomationsQueryKey } from "../queries/useAutomationsQuery";

/** Update an automation (enable/disable, retarget) (`PATCH /api/automations/:id`). */
export function useUpdateAutomationMutation() {
  const qc = useQueryClient();
  return apiClient.automations.updateAutomation.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getAutomationsQueryKey() }),
  });
}
