import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

export function getProjectPrsQueryKey(projectId: string) {
  return ["project-prs", projectId] as const;
}

/** Poll interval — PRs are polled STATE, like CI status (`useCiStatusQuery`). */
const PROJECT_PRS_POLL_MS = 60 * 1000;

/**
 * Open GitHub PRs for a project's linked repo (`GET /api/projects/:id/prs`,
 * Phase 78) — `[]` when the project has no github link (never an error; see the
 * plan's "Data source" section). Opening/merging a PR on GitHub emits no SSE
 * event into this app, so — like `useCiStatusQuery` — this keeps a slow polled
 * interval rather than relying on `runEvents` invalidation. A successful merge
 * from `useMergeProjectPrMutation` still invalidates this key immediately, so
 * the merged row drops without waiting for the next tick.
 */
export function useProjectPrsQuery(projectId: string, options?: { enabled?: boolean }) {
  return apiClient.projects.getProjectPrs.useQuery({
    queryKey: getProjectPrsQueryKey(projectId),
    queryData: { params: { id: projectId } },
    refetchInterval: PROJECT_PRS_POLL_MS,
    select: selectApiResponseBody,
    enabled: options?.enabled,
  });
}
