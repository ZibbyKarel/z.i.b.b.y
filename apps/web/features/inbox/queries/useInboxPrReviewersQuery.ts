import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for one PR's reviewers tree. */
export function getInboxPrReviewersQueryKey(projectId: string, number: number) {
  return ["inbox", "pr-reviewers", projectId, number] as const;
}

/**
 * The reviewers tree of a PR (`GET /api/inbox/prs/:projectId/:number/reviewers`).
 * Disabled until a PR is selected.
 */
export function useInboxPrReviewersQuery(projectId?: string, number?: number) {
  return apiClient.inbox.getInboxPrReviewers.useQuery({
    queryKey: getInboxPrReviewersQueryKey(projectId ?? "", number ?? 0),
    queryData: { params: { projectId: projectId ?? "", number: number ?? 0 } },
    select: selectApiResponseBody,
    enabled: Boolean(projectId && number),
    staleTime: 30_000,
  });
}
