import { useEffect, useState } from "react";
import type { RunLogChunk } from "@zibby/contracts";
import { API_URL } from "../../state/api";

const RUN_LOG_POLL_MS = 1_000;

/**
 * Tail a single run's log via offset polling, parameterized by the run kind's
 * endpoint base (`agents` or `skills`). Generalizes the agent-only
 * `useRunLogQuery`: the backend log file is the source of truth, so it starts at
 * offset 0 (lossless replay) and appends each chunk. Mount with `key={runId}`.
 */
export function useRunLog(
  runId: string | null,
  base: "agents" | "skills" | null,
): { text: string; done: boolean } {
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!runId || !base) return;
    let offset = 0;
    let active = true;

    const poll = async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/${base}/runs/${encodeURIComponent(runId)}/logs?offset=${offset}`,
          { headers: { accept: "application/json" } },
        );
        if (!active || !res.ok) return;
        const chunk = (await res.json()) as RunLogChunk;
        if (!active) return;
        if (chunk.content) setText((prev) => prev + chunk.content);
        offset = chunk.nextOffset;
        if (chunk.done) {
          setDone(true);
          clearInterval(timer);
        }
      } catch {
        // Transient errors are retried next tick.
      }
    };

    const timer = setInterval(poll, RUN_LOG_POLL_MS);
    void poll();
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [runId, base]);

  return { text, done };
}
