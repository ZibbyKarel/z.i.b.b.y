import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getRoadmapItemsQueryKey } from "../../roadmap/queries/useRoadmapItemsQuery";
import { getInboxItemsQueryKey } from "../queries/useInboxItemsQuery";

/**
 * The inbox header's `Sync` button: runs the existing per-project roadmap sync
 * (`POST /api/projects/:projectId/roadmap/sync`) for every project id it is
 * handed, then refreshes the inbox. One failing project never aborts the rest;
 * the rejected ids are returned so the caller may surface them.
 */
export function useSyncInboxMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (projectIds: string[]) => {
      const results = await Promise.allSettled(
        projectIds.map(async (projectId) => {
          const res = await apiClient.roadmap.syncRoadmapItems.mutate({
            params: { projectId },
            body: {},
          });
          if (res.status !== 200) throw new Error(`sync ${projectId}: ${res.status}`);
        }),
      );
      return projectIds.filter((_, i) => results[i]?.status === "rejected");
    },
    onSettled: (_failed, _err, projectIds) => {
      void qc.invalidateQueries({ queryKey: getInboxItemsQueryKey() });
      for (const projectId of projectIds) {
        void qc.invalidateQueries({ queryKey: getRoadmapItemsQueryKey(projectId) });
      }
    },
  });
}
