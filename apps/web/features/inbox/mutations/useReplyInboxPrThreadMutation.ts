import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getInboxPrsQueryKey } from "../queries/useInboxPrsQuery";

/**
 * Reply to and/or resolve one review thread
 * (`POST /api/inbox/prs/:projectId/:number/threads/:threadId/reply`).
 * Invalidates every PR's threads and the PR list (open-thread counts).
 */
export function useReplyInboxPrThreadMutation() {
  const qc = useQueryClient();
  return apiClient.inbox.replyInboxPrThread.useMutation({
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["inbox", "pr-threads"] });
      void qc.invalidateQueries({ queryKey: getInboxPrsQueryKey() });
    },
  });
}
