import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

const LIMITS_POLL_MS = 3 * 60 * 1000; // 3m

/** Shared cache key for the live interactive limits. */
export function getLimitsQueryKey() {
  return ["limits"] as const;
}

/**
 * Live interactive limits for the dashboard panel. Polls `GET /api/limits` on an
 * interval (same one-directional, slowly-changing payload as `useHealthQuery`, so a
 * plain `refetchInterval` beats SSE); the backend reports the real 5h/weekly
 * utilization Anthropic computes server-side, captured from the Claude Code status
 * line. Returns the TanStack query result directly; `select` only strips the
 * ts-rest envelope, so `data` is the contract `Limits` body once a fetch has landed
 * (the panel owns all presentation — labels, reset copy, freshness). Before the
 * first success — or after a failed poll — `data` is `undefined`; the panel falls
 * back to the static zero-usage config so it never flashes empty.
 */
export function useLimitsQuery() {
  return apiClient.limits.getLimits.useQuery({
    queryKey: getLimitsQueryKey(),
    refetchInterval: LIMITS_POLL_MS,
    refetchIntervalInBackground: true,
    retry: false,
    select: selectApiResponseBody,
  });
}
