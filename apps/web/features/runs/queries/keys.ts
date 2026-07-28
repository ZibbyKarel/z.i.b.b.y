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

/**
 * Shared root of every task-run query key — `allTaskRunsKey` above AND the
 * `/archiv` page's paginated `["taskRuns", "archive", ...]` queries
 * (`apps/web/features/archive/queries`). `invalidateQueries` prefix-matches by
 * default, so invalidating THIS key (never used as a `useQuery`/`useInfiniteQuery`
 * key itself) refreshes both feeds together wherever a run transitions — the same
 * mutation/SSE call sites that used to invalidate `allTaskRunsKey` alone.
 */
export const taskRunsRootKey = ["taskRuns"] as const;
