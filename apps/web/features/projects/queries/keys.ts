/**
 * Cache keys for the projects queries, kept in a dependency-free module.
 *
 * `runEvents` (the SSE invalidation hub) needs `getBudgetQueryKey` to target
 * this family, while `useBudgetQuery` needs `useRunEventsConnected` from
 * `runEvents` to gate its fallback polling. Holding the key here — with no React
 * or `runEvents` imports — keeps that relationship acyclic.
 */

/** Shared cache key for the per-engagement budget readout. */
export function getBudgetQueryKey() {
  return ["budget"] as const;
}
