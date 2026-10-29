import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getAutopilotQueryKey } from "../queries/useAutopilotQuery";

/** Switch autopilot (`PUT`); ON needs the operator token (sent globally by `apiClient`). */
export function useSetAutopilotMutation() {
  const qc = useQueryClient();
  return apiClient.autopilot.setAutopilot.useMutation({
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getAutopilotQueryKey() });
    },
  });
}
