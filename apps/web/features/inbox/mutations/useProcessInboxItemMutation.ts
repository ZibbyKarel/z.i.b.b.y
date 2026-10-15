import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getRoadmapItemsQueryKey } from "../../roadmap/queries/useRoadmapItemsQuery";
import { getInboxItemsQueryKey } from "../queries/useInboxItemsQuery";

/**
 * "Process" — plays the item in its own project (`POST
 * /api/projects/:projectId/roadmap/items/:itemId/play`). Unlike
 * `usePlayRoadmapItemMutation(projectId)` the project is a call-site variable,
 * since an inbox row belongs to any project. Invalidates the inbox list and the
 * project's roadmap board.
 */
export function useProcessInboxItemMutation() {
  const qc = useQueryClient();
  return apiClient.roadmap.playRoadmapItem.useMutation({
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: getInboxItemsQueryKey() });
      void qc.invalidateQueries({ queryKey: getRoadmapItemsQueryKey(variables.params.projectId) });
    },
  });
}
