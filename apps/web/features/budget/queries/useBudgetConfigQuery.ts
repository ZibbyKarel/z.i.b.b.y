import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Shared cache key for the operator-owned global pause/warn thresholds. */
export function getBudgetConfigQueryKey() {
  return ["budget-config"] as const;
}

/**
 * The operator-owned global pause/warn thresholds from `GET /api/budget/config`
 * (`data/budget.json`) — `pauseAtRollingPct`/`pauseAtWeeklyPct` (hard, hold every
 * dispatch) and the additive `warnAtRollingPct`/`warnAtWeeklyPct` (O-08, non-blocking
 * — see `docs/api/budget.md`). The Ledger spend screen's sliders read + write this.
 */
export function useBudgetConfigQuery() {
  return apiClient.budget.getBudgetConfig.useQuery({
    queryKey: getBudgetConfigQueryKey(),
    select: selectApiResponseBody,
  });
}
