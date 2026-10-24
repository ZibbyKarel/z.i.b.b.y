import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getProjectHealthQueryKey } from "../queries/useProjectHealthQuery";

/**
 * Operator-triggered "Analyze" (`POST /api/project-health/:projectId/analyze`):
 * creates one ordinary investigation task. 404/409/503 throw (ts-rest) and are
 * shown inline by the call site, hence `meta.inlineError`. Refreshes the health
 * status on any outcome — `analysisTaskId` is stored server-side.
 */
export function useAnalyzeProjectHealthMutation() {
  const queryClient = useQueryClient();
  return apiClient.projectHealth.analyzeProjectHealth.useMutation({
    meta: { inlineError: true },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: getProjectHealthQueryKey() });
    },
  });
}
