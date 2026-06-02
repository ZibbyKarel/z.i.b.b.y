import type { Limits } from "@zibby/contracts";
import type { QuotaLimit } from "../../domain";
import { apiClient } from "../../state/api";
import { CLAUDE_LIMITS } from "../../state/config";

const LIMITS_POLL_MS = 15_000;

/**
 * Compact a token count the way the panel reads it: `200000 → "200k"`,
 * `5_000_000 → "5M"`, small counts verbatim. Display-only, so it lives on the
 * frontend — the backend ships raw numbers.
 */
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`.replace(".0M", "M");
  if (n >= 1_000) return `${Math.round(n / 100) / 10}k`.replace(".0k", "k");
  return String(n);
}

/**
 * Overlay live usage from the API onto a static `QuotaLimit` template. The
 * template carries the i18n keys (`label`, `short`, `resetIn` — presentation);
 * the API carries the real numbers (`usedPct`, token counts).
 */
function mergeWindow(template: QuotaLimit, w: Limits["rolling"]): QuotaLimit {
  return {
    ...template,
    usedPct: w.usedPct,
    tokens: `${formatTokens(w.usedTokens)} / ${formatTokens(w.limitTokens)}`,
  };
}

export interface LimitsView {
  rolling: QuotaLimit;
  weekly: QuotaLimit;
}

/**
 * Live interactive limits for the dashboard panel. Polls `GET /api/limits` on an
 * interval (same one-directional, slowly-changing payload as `useHealth`, so a
 * plain `refetchInterval` beats SSE); the backend computes real 5h/weekly token
 * usage from the local Claude Code transcripts. Before the first successful fetch
 * — or after a failed poll — it falls back to the static zero-usage config so the
 * panel always has data to render and never flashes empty.
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
    rolling: mergeWindow(CLAUDE_LIMITS.rolling, live.rolling),
    weekly: mergeWindow(CLAUDE_LIMITS.weekly, live.weekly),
  };
}
