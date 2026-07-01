import { useRunEventsConnected } from "../../runs/runEvents";
import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";
import { getBudgetQueryKey } from "./keys";

// Re-exported so existing deep importers keep resolving the key from here; the
// canonical home is the dependency-free `./keys` module (see its header).
export { getBudgetQueryKey };

/** Fallback cadence when the SSE channel is down — push covers the live path. */
const BUDGET_POLL_MS = 30 * 1000; // 30s — run counts + queue depth move on dispatch/terminal

/**
 * Live per-engagement budget status from `GET /api/budget` (Phase 8.1): one row per
 * project with a budget (daily/weekly used vs cap, running count, queued/held) plus
 * the global account ceiling. Freshness is push-driven: the run-events provider
 * invalidates this key on every run transition (the counts only move on
 * dispatch/terminal), so the 30s interval exists ONLY while the SSE channel is
 * down (DNA: SSE for live streams, polling for state). `select` strips the
 * ts-rest envelope so `data` is the contract `BudgetStatus`.
 */
export function useBudgetQuery() {
  const streamConnected = useRunEventsConnected();
  return apiClient.budget.getBudget.useQuery({
    queryKey: getBudgetQueryKey(),
    refetchInterval: streamConnected ? false : BUDGET_POLL_MS,
    retry: false,
    select: selectApiResponseBody,
  });
}
