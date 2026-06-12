import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

const BUDGET_POLL_MS = 30 * 1000; // 30s — run counts + queue depth move on dispatch/terminal

/** Shared cache key for the per-engagement budget readout. */
export function getBudgetQueryKey() {
  return ["budget"] as const;
}

/**
 * Live per-engagement budget status from `GET /api/budget` (Phase 8.1): one row per
 * project with a budget (daily/weekly used vs cap, running count, queued/held) plus
 * the global account ceiling. Polled (the counts change on dispatch + run-terminal,
 * which also push the runs feed); `select` strips the ts-rest envelope so `data` is
 * the contract `BudgetStatus`. The run-events provider also invalidates this key on
 * run status events so a held→dispatched transition reflects immediately.
 */
export function useBudgetQuery() {
  return apiClient.budget.getBudget.useQuery({
    queryKey: getBudgetQueryKey(),
    refetchInterval: BUDGET_POLL_MS,
    retry: false,
    select: selectApiResponseBody,
  });
}
