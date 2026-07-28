import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getRoadmapConfigQueryKey } from "../queries/useRoadmapConfigQuery";

/**
 * Replace a project's roadmap config (`PUT /api/projects/:projectId/roadmap/config`)
 * — today just the `autoSync` toggle next to the roadmap tab's Sync button (125h).
 */
export function useSetRoadmapConfigMutation(projectId: string) {
  const qc = useQueryClient();
  return apiClient.roadmap.putRoadmapConfig.useMutation({
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getRoadmapConfigQueryKey(projectId) });
    },
  });
}
