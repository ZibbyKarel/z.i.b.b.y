import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getAutomationsQueryKey } from "../queries/useAutomationsQuery";

/** Create an automation (`POST /api/automations`). */
export function useCreateAutomationMutation() {
  const qc = useQueryClient();
  return apiClient.automations.createAutomation.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getAutomationsQueryKey() }),
  });
}
