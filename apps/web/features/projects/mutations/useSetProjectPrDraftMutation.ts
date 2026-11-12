import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getInboxPrsQueryKey } from "../../inbox/queries/useInboxPrsQuery";

/**
 * Convert a PR to draft / mark it ready for review (`POST /api/projects/:id/prs/:number/draft`,
 * todo-15). An explicit operator click in the PR detail only. Invalidates the inbox PR list.
 */
export function useSetProjectPrDraftMutation() {
  const qc = useQueryClient();
  return apiClient.projects.setProjectPrDraft.useMutation({
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getInboxPrsQueryKey() });
    },
  });
}
