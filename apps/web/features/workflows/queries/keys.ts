/**
 * Cache keys for the workflows queries, kept in a dependency-free module.
 *
 * `runEvents` (the SSE invalidation hub) needs `getWorkflowRunQueryKey`, while
 * `useWorkflowRunQuery` needs `useRunEventsConnected` from `runEvents` to gate its
 * polling. Holding the key here — with no React or `runEvents` imports — keeps that
 * relationship acyclic.
 */

/** Cache key for a single workflow run (refreshed as it executes). */
export function getWorkflowRunQueryKey(workflowRunId: string) {
  return ["workflowRun", workflowRunId] as const;
}
