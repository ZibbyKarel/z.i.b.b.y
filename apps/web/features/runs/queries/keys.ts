/**
 * Cache keys for the runs queries, kept in a dependency-free module.
 *
 * `runEvents` (the SSE invalidation hub) needs `allTaskRunsKey`, while
 * `useRunsQuery` needs `useRunEventsConnected` from `runEvents` to gate its
 * polling. Holding the key here — with no React or `runEvents` imports — keeps that
 * relationship acyclic.
 */

/**
 * Cache key for the unified task-run feed. Exported so the stop/resume/delete
 * mutations and the SSE channel invalidate exactly what the feed reads.
 */
export const allTaskRunsKey = ["taskRuns", "all"] as const;
