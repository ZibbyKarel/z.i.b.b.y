import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for one PR's unified diff. */
export function getInboxPrDiffQueryKey(projectId: string, number: number) {
  return ["inbox", "pr-diff", projectId, number] as const;
}

/**
 * The unified diff of a PR (`GET /api/inbox/prs/:projectId/:number/diff`).
 * Disabled until a PR is selected; a diff is immutable enough to cache for a minute.
 */
export function useInboxPrDiffQuery(projectId: string | undefined, number: number | undefined) {
  return apiClient.inbox.getInboxPrDiff.useQuery({
    queryKey: getInboxPrDiffQueryKey(projectId ?? "", number ?? 0),
    queryData: { params: { projectId: projectId ?? "", number: number ?? 0 } },
    select: selectApiResponseBody,
    enabled: Boolean(projectId && number),
    staleTime: 60_000,
  });
}
