import { useEffect, useState } from "react";
import type { RunLogChunk } from "@zibby/contracts";
import { API_URL } from "../../state/api";

/** Fallback tail interval, used only when SSE is unavailable. */
const RUN_LOG_POLL_MS = 1_000;

/**
 * Tail a single run's log, preferring the server's SSE stream
 * (`…/logs/stream`) over offset polling. The backend log file is the source of
 * truth, so the stream replays the whole backlog from offset 0 on connect and
 * pushes each appended chunk — a reload mid-run stays lossless, and EventSource's
 * native reconnect resumes via `Last-Event-ID` (the byte offset) without
 * duplicating what we already have.
 *
 * If the stream can't be established at all (an old browser, or a proxy that
 * strips SSE) the hook falls back to the original 1s offset poll against the
 * contract's `…/logs` endpoint, so the viewer keeps working everywhere. Mount the
 * consumer with `key={runId}` so a new run gets a fresh hook.
 *
 * Every run kind's log is served from the one unified surface
 * (`/api/tasks/runs/:runId/logs`), with the resolver dispatching to the owning
 * runner. A `null` run id renders nothing.
 */
export function useRunLogStream(runId: string | null): { text: string; done: boolean } {
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!runId) return;
    let active = true;
    let offset = 0;
    let opened = false;
    let source: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const logsBase = `${API_URL}/api/tasks/runs/${encodeURIComponent(runId)}/logs`;

    const apply = (chunk: { content: string; nextOffset: number; done: boolean }) => {
      if (!active) return;
      if (chunk.content) setText((prev) => prev + chunk.content);
      offset = chunk.nextOffset;
      if (chunk.done) {
        setDone(true);
        cleanup();
      }
    };

    // Fallback: the original offset poll, started only if the stream never opens.
    const startPolling = () => {
      if (!active || pollTimer) return;
      const poll = async () => {
        try {
          const res = await fetch(`${logsBase}?offset=${offset}`, {
            headers: { accept: "application/json" },
          });
          if (!active || !res.ok) return;
          apply((await res.json()) as RunLogChunk);
        } catch {
          // Transient errors are retried on the next tick.
        }
      };
      pollTimer = setInterval(poll, RUN_LOG_POLL_MS);
      void poll();
    };

    const startStreaming = () => {
      if (typeof EventSource === "undefined") {
        startPolling();
        return;
      }
      source = new EventSource(`${logsBase}/stream`);
      source.onopen = () => {
        opened = true;
      };
      source.onmessage = (event) => {
        try {
          apply(JSON.parse(event.data) as RunLogChunk);
        } catch {
          // Ignore a malformed frame; the next one carries the offset forward.
        }
      };
      source.onerror = () => {
        // Never opened → SSE is likely blocked end-to-end: drop to polling. Once
        // it has opened we let EventSource reconnect itself (Last-Event-ID resumes
        // the offset), so we don't double-read by also polling.
        if (!opened && active) {
          source?.close();
          source = null;
          startPolling();
        }
      };
    };

    function cleanup() {
      active = false;
      source?.close();
      source = null;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }

    startStreaming();
    return cleanup;
  }, [runId]);

  return { text, done };
}
