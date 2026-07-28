import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getRoadmapItemsQueryKey } from "../queries/useRoadmapItemsQuery";

/**
 * Manually create a roadmap epic or task (125f, `POST
 * /api/projects/:projectId/roadmap/items`) — 422 when `parentId` doesn't
 * resolve to an existing epic. Invalidates the project's item list so the
 * new item shows up on the board/epic list without a manual refetch.
 */
export function useCreateRoadmapItemMutation(projectId: string) {
  const qc = useQueryClient();
  return apiClient.roadmap.createRoadmapItem.useMutation({
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getRoadmapItemsQueryKey(projectId) });
    },
  });
}
