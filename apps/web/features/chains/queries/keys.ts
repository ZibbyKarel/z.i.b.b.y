/**
 * Cache keys for the chains queries, kept in a dependency-free module.
 *
 * `runEvents` (the SSE invalidation hub) needs `getChainRunsQueryKey` — a chain
 * advances exactly when a pipeline run transitions — while the query hooks need
 * `useRunEventsConnected` from `runEvents` to gate their fallback polling.
 * Holding the keys here keeps that relationship acyclic.
 */

/** Shared cache key for the chain definitions list. */
export function getChainsQueryKey() {
  return ["chains"] as const;
}

/** Shared cache key for the chain runs list. */
export function getChainRunsQueryKey() {
  return ["chains", "runs"] as const;
}
