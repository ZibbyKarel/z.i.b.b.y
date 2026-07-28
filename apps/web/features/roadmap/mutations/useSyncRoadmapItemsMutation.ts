import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getRoadmapItemsQueryKey } from "../queries/useRoadmapItemsQuery";

/**
 * Manually pull the project's Jira/GitHub roadmap items (`POST
 * /api/projects/:projectId/roadmap/sync`) — the roadmap tab header's Sync
 * button (125b/125h). Invalidates the item list on success so imported/
 * updated/archived items show immediately; the mutation's own response
 * carries the `RoadmapSyncResultSchema` summary for the caller to surface.
 */
export function useSyncRoadmapItemsMutation(projectId: string) {
  const qc = useQueryClient();
  return apiClient.roadmap.syncRoadmapItems.useMutation({
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getRoadmapItemsQueryKey(projectId) });
    },
  });
}
