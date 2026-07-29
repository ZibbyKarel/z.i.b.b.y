import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getRoadmapItemsQueryKey } from "../queries/useRoadmapItemsQuery";

/**
 * Resume a `failed` item's last run in place (`POST
 * /api/projects/:projectId/roadmap/items/:itemId/resume`, 125e) — the
 * cheaper of the two recovery actions, continuing the same run instead of
 * starting a fresh one. 409s server-side when the last run has no `runRef`
 * (never actually dispatched) or isn't currently resumable. Invalidates the
 * project's item list on success so the card's `running` lifecycle reflects
 * at once.
 */
export function useResumeRoadmapItemMutation(projectId: string) {
  const qc = useQueryClient();
  return apiClient.roadmap.resumeRoadmapItem.useMutation({
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getRoadmapItemsQueryKey(projectId) });
    },
  });
}
