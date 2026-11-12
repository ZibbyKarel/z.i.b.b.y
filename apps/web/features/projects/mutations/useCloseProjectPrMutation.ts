import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getInboxPrsQueryKey } from "../../inbox/queries/useInboxPrsQuery";

/**
 * Close a PR without merging (`POST /api/projects/:id/prs/:number/close`, todo-15).
 * Outward and hard to undo: called only from the PR detail's confirm dialog, never without the
 * operator's explicit click. Invalidates the inbox PR list so the closed PR drops off.
 */
export function useCloseProjectPrMutation() {
  const qc = useQueryClient();
  return apiClient.projects.closeProjectPr.useMutation({
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getInboxPrsQueryKey() });
    },
  });
}
