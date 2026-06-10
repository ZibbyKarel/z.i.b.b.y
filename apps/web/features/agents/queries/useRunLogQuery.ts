import { useRunLogStream } from "../../runs/useRunLogStream";

/**
 * Tail a single agent run's log. A thin alias over the shared
 * {@link useRunLogStream}, which prefers the server's SSE stream
 * (`/api/agents/runs/:id/logs/stream`) and falls back to offset polling when SSE
 * is unavailable. The backend log file is the source of truth, so a frontend
 * reload mid-run replays losslessly from offset 0. Mount the consumer with
 * `key={runId}` so a new run gets a fresh hook.
 */
export function useRunLogQuery(runId: string | null): { text: string; done: boolean } {
  return useRunLogStream(runId, "agents");
}
