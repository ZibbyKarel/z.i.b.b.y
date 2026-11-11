import type { QueryClient } from "@tanstack/react-query";
import { getInboxRootKey } from "../../inbox/queries/useInboxPrsQuery";
import { taskRunsRootKey } from "../../runs/queries/keys";
import { getApprovalsQueryKey } from "../queries/useApprovalsQuery";

/** GitHub's own reads lag a push / posted replies by a few seconds. */
const GITHUB_SETTLE_MS = 5_000;

/**
 * Refresh everything a decided approval changes: the queue, the run it gated (feed + detail) and
 * the whole inbox family — the PR list AND an open PR's threads / diff (todo-2: a posted review,
 * pushed fixes or thread replies change them). The inbox is refetched once more after GitHub has
 * settled, so the chip doesn't keep showing "waiting for you" until a page reload.
 */
export function invalidateAfterDecision(queryClient: QueryClient) {
  const refreshPrs = () => void queryClient.invalidateQueries({ queryKey: getInboxRootKey() });
  void queryClient.invalidateQueries({ queryKey: getApprovalsQueryKey() });
  void queryClient.invalidateQueries({ queryKey: taskRunsRootKey });
  refreshPrs();
  setTimeout(refreshPrs, GITHUB_SETTLE_MS);
}
