/**
 * Cache keys for the approvals queries, kept in a dependency-free module.
 *
 * `runEvents` (the SSE invalidation hub) needs `getApprovalsQueryKey` to target
 * this family, while `useApprovalsQuery` needs `useRunEventsConnected` from
 * `runEvents` to gate its fallback polling. Holding the key here — with no React
 * or `runEvents` imports — keeps that relationship acyclic.
 */

/** Shared cache key for pending approvals; exported so mutations can invalidate it. */
export function getApprovalsQueryKey() {
  return ["approvals", "pending"] as const;
}
