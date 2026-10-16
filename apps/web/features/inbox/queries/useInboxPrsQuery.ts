import { MINUTE_MS } from "../../../utils/time";
import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Shared cache key for the inbox pull-request list. */
export function getInboxPrsQueryKey() {
  return ["inbox", "prs"] as const;
}

/**
 * The operator's GitHub PRs (`GET /api/inbox/prs`): review requests on me or my
 * team plus my own open PRs. State is polled every 15 min; inbox-refresh activity
 * refreshes it immediately via RunEventsProvider.
 */
export function useInboxPrsQuery(options?: { enabled?: boolean }) {
  return apiClient.inbox.listInboxPrs.useQuery({
    queryKey: getInboxPrsQueryKey(),
    select: selectApiResponseBody,
    enabled: options?.enabled,
    refetchInterval: 15 * MINUTE_MS,
  });
}
