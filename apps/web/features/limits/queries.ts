import type { Limits } from "@zibby/contracts";
import type { QuotaLimit } from "../../domain";
import { apiClient } from "../../state/api";
import { CLAUDE_LIMITS } from "../../state/config";

const LIMITS_POLL_MS = 15_000;

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

/**
 * Live interactive limits for the dashboard panel. Polls `GET /api/limits` on an
 * interval (same one-directional, slowly-changing payload as `useHealth`, so a
 * plain `refetchInterval` beats SSE); the backend reports the real 5h/weekly
 * utilization Anthropic computes server-side, captured from the Claude Code
 * status line. Before the first successful fetch — or after a failed poll — it
 * falls back to the static zero-usage config so the panel always has data to
 * render and never flashes empty.
 */
export function useLimits(): LimitsView {
  const { data } = apiClient.limits.getLimits.useQuery({
    queryKey: ["limits"],
    refetchInterval: LIMITS_POLL_MS,
    refetchIntervalInBackground: true,
    retry: false,
  });

  const live = data?.body;
  if (!live) {
    return { rolling: CLAUDE_LIMITS.rolling, weekly: CLAUDE_LIMITS.weekly };
  }

  return {
    rolling: mergeWindow(CLAUDE_LIMITS.rolling, live.rolling, live.stale),
    weekly: mergeWindow(CLAUDE_LIMITS.weekly, live.weekly, live.stale),
  };
}
