import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getRoadmapItemsQueryKey } from "../queries/useRoadmapItemsQuery";

/**
 * Play a roadmap item ("zařadit" — enqueue it; the gate releases it once its
 * dependencies are done, 125e). `POST
 * /api/projects/:projectId/roadmap/items/:itemId/play`. Invalidates the
 * project's item list on success so the card's lifecycle (`enqueued` or
 * `running`, depending on whether the gate released it immediately) reflects
 * at once; also invalidates the cross-project TODO list (Bridge TODO widget).
 */
export function usePlayRoadmapItemMutation(projectId: string) {
  const qc = useQueryClient();
  return apiClient.roadmap.playRoadmapItem.useMutation({
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getRoadmapItemsQueryKey(projectId) });
    },
  });
}
