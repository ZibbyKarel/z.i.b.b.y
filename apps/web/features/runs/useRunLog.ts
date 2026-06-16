import { useRunLogStream } from "./useRunLogStream";

/**
 * Tail a single run's log from the unified `/api/tasks/runs/:runId/logs` surface. A
 * thin alias over {@link useRunLogStream}, which prefers the server's SSE stream and
 * falls back to offset polling when SSE is unavailable. Mount the consumer with
 * `key={runId}`.
 */
export function useRunLog(runId: string | null): { text: string; done: boolean } {
  return useRunLogStream(runId);
}
