import { MINUTE_MS } from "../../../utils/time";
import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/**
 * Shared root of every inbox query key — the PR list, issues, and one PR's threads / diff.
 * Invalidating it (prefix match) refreshes the PR detail along with the list (todo-2).
 */
export function getInboxRootKey() {
  return ["inbox"] as const;
}

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
