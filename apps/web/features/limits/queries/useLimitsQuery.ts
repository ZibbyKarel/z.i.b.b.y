import type { Limits } from "@zibby/contracts";
import type { QuotaLimit } from "../../../domain";
import { apiClient } from "../../../state/api";
import { CLAUDE_LIMITS } from "../../../state/config";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

const LIMITS_POLL_MS = 15_000;

/** Shared cache key for the live interactive limits. */
export function getLimitsQueryKey() {
  return ["limits"] as const;
}

/**
 * Overlay live utilization from the API onto a static `QuotaLimit` template. The
 * template carries the i18n keys (`label`, `short`, `resetIn` — presentation);
 * the API carries the real `usedPct` (server-computed 5h/weekly utilization) and
 * the `stale` flag, which picks the freshness key.
 */
function mergeWindow(template: QuotaLimit, w: Limits["rolling"], stale: boolean): QuotaLimit {
  return {
    ...template,
    usedPct: w.usedPct,
    age: stale ? "limits.stale" : "limits.live",
  };
}

export interface LimitsView {
  rolling: QuotaLimit;
  weekly: QuotaLimit;
}

/** Project the live `Limits` body onto the presentation templates. */
function toLimitsView(live: Limits): LimitsView {
  return {
    rolling: mergeWindow(CLAUDE_LIMITS.rolling, live.rolling, live.stale),
    weekly: mergeWindow(CLAUDE_LIMITS.weekly, live.weekly, live.stale),
  };
}

/**
 * Live interactive limits for the dashboard panel. Polls `GET /api/limits` on an
 * interval (same one-directional, slowly-changing payload as `useHealthQuery`, so a
 * plain `refetchInterval` beats SSE); the backend reports the real 5h/weekly
 * utilization Anthropic computes server-side, captured from the Claude Code status
 * line. Returns the TanStack query result directly; `select` unwraps the envelope
 * and merges the live payload onto the static templates, so `data` is a `LimitsView`
 * once a fetch has landed. Before the first success — or after a failed poll — `data`
 * is `undefined`; the panel falls back to the static zero-usage config so it never
 * flashes empty.
 */
export function useLimitsQuery() {
  return apiClient.limits.getLimits.useQuery({
    queryKey: getLimitsQueryKey(),
    refetchInterval: LIMITS_POLL_MS,
    refetchIntervalInBackground: true,
    retry: false,
    select: (response) => toLimitsView(selectApiResponseBody(response)),
  });
}
