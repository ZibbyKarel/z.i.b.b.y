/**
 * Cache keys for the pipelines queries, kept in a dependency-free module.
 *
 * `runEvents` (the SSE invalidation hub) needs `getPipelineRunQueryKey`, while
 * `usePipelineRunQuery` needs `useRunEventsConnected` from `runEvents` to gate its
 * polling. Holding the key here — with no React or `runEvents` imports — keeps that
 * relationship acyclic.
 */

/** Cache key for a single pipeline run (refreshed as it executes). */
export function getPipelineRunQueryKey(pipelineRunId: string) {
  return ["pipelineRun", pipelineRunId] as const;
}
