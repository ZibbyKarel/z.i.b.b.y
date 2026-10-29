import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getRoadmapItemsQueryKey } from "../../roadmap/queries/useRoadmapItemsQuery";
import { getInboxItemsQueryKey } from "../queries/useInboxItemsQuery";

/**
 * "Process" — hands a live issue to ZIBBY (`POST /api/inbox/items/process`): the API writes a
 * local roadmap record if none exists, then plays it in its own project. The project is a
 * call-site variable, since an inbox row belongs to any project. Invalidates the inbox list
 * and the project's roadmap board.
 */
export function useProcessInboxItemMutation() {
  const qc = useQueryClient();
  return apiClient.inbox.processInboxItem.useMutation({
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: getInboxItemsQueryKey() });
      void qc.invalidateQueries({ queryKey: getRoadmapItemsQueryKey(variables.body.projectId) });
    },
  });
}
