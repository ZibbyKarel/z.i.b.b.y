import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getProjectHealthQueryKey } from "../queries/useProjectHealthQuery";

/**
 * "Check now" (`POST /api/project-health/:projectId/check`): runs one check
 * immediately. Failures are shown inline (`meta.inlineError`); the health status
 * refreshes on any outcome.
 */
export function useCheckProjectHealthMutation() {
  const queryClient = useQueryClient();
  return apiClient.projectHealth.checkProjectHealth.useMutation({
    meta: { inlineError: true },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: getProjectHealthQueryKey() });
    },
  });
}
