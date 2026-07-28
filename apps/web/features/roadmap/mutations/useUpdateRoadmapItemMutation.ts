import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getRoadmapItemsQueryKey } from "../queries/useRoadmapItemsQuery";

/**
 * Edit a roadmap item's operator-owned fields (125f dependency editing +
 * the detail dialog, `PATCH /api/projects/:projectId/roadmap/items/:itemId`).
 * `dependsOn` is sent WHOLESALE by every call site — this hook does no
 * merging of its own, it only invalidates the project's item list on success.
 */
export function useUpdateRoadmapItemMutation(projectId: string) {
  const qc = useQueryClient();
  return apiClient.roadmap.updateRoadmapItem.useMutation({
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getRoadmapItemsQueryKey(projectId) });
    },
  });
}
