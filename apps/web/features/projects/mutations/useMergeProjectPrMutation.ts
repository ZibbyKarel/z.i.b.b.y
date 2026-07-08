import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getProjectPrsQueryKey } from "../queries/useProjectPrsQuery";

/**
 * Merge one open PR (`POST /api/projects/:id/prs/:number/merge`, Phase 78).
 *
 * **Tier-3 (CLAUDE.md "surface and wait" / Law "Never: Auto-merge"): ZIBBY never
 * merges on its own.** This hook is called from exactly one place —
 * `ProjectPullRequestsPanel`'s confirm-dialog `onConfirm` — never fired without
 * the operator's explicit click. On success the merged PR drops off the list via
 * invalidating this project's PR overview.
 */
export function useMergeProjectPrMutation() {
  const qc = useQueryClient();
  return apiClient.projects.mergeProjectPr.useMutation({
    onSuccess: (_data, { params: { id } }) => {
      void qc.invalidateQueries({ queryKey: getProjectPrsQueryKey(id) });
    },
  });
}
