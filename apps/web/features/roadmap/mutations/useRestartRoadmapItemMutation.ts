import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getRoadmapItemsQueryKey } from "../queries/useRoadmapItemsQuery";

/**
 * Restart a `failed` item with a brand-new task (`POST
 * /api/projects/:projectId/roadmap/items/:itemId/restart`, 125e) — the
 * roadmap card's recovery action when the last run isn't resumable, or when a
 * fresh attempt is preferred over continuing the old one. Invalidates the
 * project's item list on success so the card's lifecycle (`enqueued` or
 * `running`) reflects at once.
 */
export function useRestartRoadmapItemMutation(projectId: string) {
  const qc = useQueryClient();
  return apiClient.roadmap.restartRoadmapItem.useMutation({
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getRoadmapItemsQueryKey(projectId) });
    },
  });
}
