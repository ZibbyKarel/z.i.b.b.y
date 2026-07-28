import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getRoadmapItemsQueryKey } from "../queries/useRoadmapItemsQuery";

/**
 * Delete a roadmap item (`DELETE
 * /api/projects/:projectId/roadmap/items/:itemId`). Invalidates the
 * project's item list on success.
 */
export function useDeleteRoadmapItemMutation(projectId: string) {
  const qc = useQueryClient();
  return apiClient.roadmap.deleteRoadmapItem.useMutation({
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getRoadmapItemsQueryKey(projectId) });
    },
  });
}
