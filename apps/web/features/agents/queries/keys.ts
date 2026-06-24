/**
 * Cache keys for the agents queries, kept in a dependency-free module.
 *
 * `runEvents` (the SSE invalidation hub) needs `getRunningAgentsQueryKey` to
 * target this family, while `useRunningAgentsQuery` needs `useRunEventsConnected`
 * from `runEvents` to gate its polling. Holding the key here — with no React or
 * `runEvents` imports — keeps that relationship acyclic.
 */

/**
 * Shared cache key for the live running-agents list. Exported so the run
 * mutations and the SSE invalidation hub can target it.
 */
export function getRunningAgentsQueryKey() {
  return ["agents", "running"] as const;
}
