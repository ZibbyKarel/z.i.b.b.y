import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

export function getMergeQueueQueryKey(projectId?: string) {
  return ["maestro-queue", projectId ?? "all"] as const;
}

/** Poll interval — the queue is polled STATE, like `useProjectPrsQuery`/`useCiStatusQuery`. */
const MERGE_QUEUE_POLL_MS = 60 * 1000;

/**
 * Maestro's cross-project merge queue (`GET /api/maestro/queue`, NS2 F5b/F7b-1) —
 * every open PR across project repos enriched with release signals, for the
 * operator's "what can I merge now" glance. Read-only; a successful merge
 * (`useMergeProjectPrMutation`) invalidates this key so the merged entry drops
 * without waiting for the next poll.
 */
export function useMergeQueueQuery(projectId?: string) {
  return apiClient.maestro.getMergeQueue.useQuery({
    queryKey: getMergeQueueQueryKey(projectId),
    queryData: { query: projectId ? { projectId } : {} },
    refetchInterval: MERGE_QUEUE_POLL_MS,
    select: selectApiResponseBody,
  });
}
