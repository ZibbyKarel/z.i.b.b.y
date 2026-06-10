import { useRunLogStream } from "./useRunLogStream";

/**
 * Tail a single run's log, parameterized by the run kind's endpoint base
 * (`agents` or `skills`). A thin alias over {@link useRunLogStream}, which prefers
 * the server's SSE stream and falls back to offset polling when SSE is
 * unavailable. Mount the consumer with `key={runId}`.
 */
export function useRunLog(
  runId: string | null,
  base: "agents" | "skills" | null,
): { text: string; done: boolean } {
  return useRunLogStream(runId, base);
}
