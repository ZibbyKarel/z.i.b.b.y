import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for one PR's review threads. */
export function getInboxPrThreadsQueryKey(projectId: string, number: number) {
  return ["inbox", "pr-threads", projectId, number] as const;
}

/**
 * The review threads of a PR (`GET /api/inbox/prs/:projectId/:number/threads`).
 * Disabled until a PR is selected.
 */
export function useInboxPrThreadsQuery(projectId?: string, number?: number) {
  return apiClient.inbox.getInboxPrThreads.useQuery({
    queryKey: getInboxPrThreadsQueryKey(projectId ?? "", number ?? 0),
    queryData: { params: { projectId: projectId ?? "", number: number ?? 0 } },
    select: selectApiResponseBody,
    enabled: Boolean(projectId && number),
    staleTime: 30_000,
  });
}
