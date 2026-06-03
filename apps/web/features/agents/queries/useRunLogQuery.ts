import { useEffect, useState } from "react";
import { API_URL } from "../../../state/api";

/** Tail interval for a single run's log. */
const RUN_LOG_POLL_MS = 1_000;

/**
 * Tail a single run's log via offset polling. The log file on the backend is the
 * source of truth, so this hook keeps no durable state of its own: it starts at
 * offset 0 and reads the whole history back, then appends each new chunk — making
 * a frontend reload mid-run lossless without any SSE/reconnect plumbing. Mount the
 * consumer with `key={runId}` so a new run gets a fresh hook (the `runId` is then
 * stable for the hook's life and never needs an in-effect state reset).
 *
 * Reads the backend file directly rather than through the TanStack cache, so it has
 * no shared query key.
 */
export function useRunLogQuery(runId: string | null): { text: string; done: boolean } {
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!runId) return;
    let offset = 0;
    let active = true;

    const poll = async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/agents/runs/${encodeURIComponent(runId)}/logs?offset=${offset}`,
          { headers: { accept: "application/json" } },
        );
        if (!active || !res.ok) return;
        const chunk = (await res.json()) as { content: string; nextOffset: number; done: boolean };
        if (!active) return;
        if (chunk.content) setText((prev) => prev + chunk.content);
        offset = chunk.nextOffset;
        if (chunk.done) {
          setDone(true);
          clearInterval(timer);
        }
      } catch {
        // Transient network errors are retried on the next tick.
      }
    };

    const timer = setInterval(poll, RUN_LOG_POLL_MS);
    void poll();
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [runId]);

  return { text, done };
}
