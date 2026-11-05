import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getInboxPrsQueryKey } from "../queries/useInboxPrsQuery";

/**
 * Reply to and/or resolve one review thread
 * (`POST /api/inbox/prs/:projectId/:number/threads/:threadId/reply`).
 * Invalidates every PR's threads and the PR list (open-thread counts). `onSuccess` returns the
 * invalidations, so the mutation stays pending until both refetches land and the send button's
 * loading covers the whole round-trip.
 */
export function useReplyInboxPrThreadMutation() {
  const qc = useQueryClient();
  return apiClient.inbox.replyInboxPrThread.useMutation({
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["inbox", "pr-threads"] }),
        qc.invalidateQueries({ queryKey: getInboxPrsQueryKey() }),
      ]),
  });
}
