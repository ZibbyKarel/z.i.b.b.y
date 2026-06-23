import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ChatToolEvent } from "@zibby/contracts";
import { API_URL } from "../../../state/api";
import { getChatTranscriptQueryKey } from "../queries/useChatTranscriptQuery";

/**
 * The live state of the assistant's in-progress turn, accumulated from the SSE
 * token stream. Consumers render `text` as a streaming bubble while `streaming`
 * is true; `toolEvents` are inline dispatch announcements; `error` is a terminal
 * stream failure.
 */
export interface ChatStreamState {
  /** The turn currently streaming, or `null` between turns. */
  turnId: string | null;
  /** Accumulated assistant text for the current turn (final on `done`). */
  text: string;
  /** Tool events announced during the current turn, in arrival order. */
  toolEvents: ChatToolEvent[];
  /** True between the first delta/tool and the terminal `done`/`error`. */
  streaming: boolean;
  /** Terminal stream error message, if the turn failed. */
  error: string | null;
}

/**
 * The SSE payload shape (mirror of the API's `ChatTurnEvent` discriminated union).
 * Each frame's `data` is one of these JSON objects.
 */
type ChatTurnEvent =
  | { conversationId: string; turnId: string; type: "delta"; text: string }
  | { conversationId: string; turnId: string; type: "tool"; tool: ChatToolEvent }
  | { conversationId: string; turnId: string; type: "done"; text: string }
  | { conversationId: string; turnId: string; type: "error"; message: string };

const EMPTY: ChatStreamState = {
  turnId: null,
  text: "",
  toolEvents: [],
  streaming: false,
  error: null,
};

/**
 * Open one `EventSource` to `/api/chat/stream?conversationId=` and turn the token
 * frames into the live assistant-turn state. The URL is resolved against the same
 * configurable `API_URL` the rest of the app uses (see `state/api.ts`), exactly as
 * `runEvents.tsx` resolves `/api/events`.
 *
 * Deltas are appended into a per-turn buffer keyed by `turnId` — a new turn resets
 * the buffer, and the terminal `done.text` is treated as authoritative (deltas can
 * drop). On `done` the persisted transcript is invalidated so the finished turn
 * (with its `toolEvents`) reloads from the source of truth; the live buffer then
 * gives way to the persisted message.
 *
 * The stream is scoped to the hook's lifetime: it opens when a `conversationId` is
 * known and closes on unmount (the overlay closing), which is lighter than an
 * always-on provider — on reopen the transcript refetch already carries the final
 * text. A `null` conversationId is inert (nothing to stream yet).
 */
export function useChatStream(conversationId: string | null): ChatStreamState {
  const qc = useQueryClient();
  // The buffered state is tagged with the conversation it belongs to, so a frame
  // from a freshly-opened stream (a different conversation) resets it inside the
  // functional update — no synchronous setState in the effect.
  const [tagged, setState] = useState<{ forConversation: string | null } & ChatStreamState>({
    forConversation: null,
    ...EMPTY,
  });

  useEffect(() => {
    if (!conversationId || !API_URL || typeof EventSource === "undefined") return;

    const source = new EventSource(
      `${API_URL}/api/chat/stream?conversationId=${encodeURIComponent(conversationId)}`,
    );

    source.onmessage = (event) => {
      let parsed: ChatTurnEvent;
      try {
        parsed = JSON.parse(event.data) as ChatTurnEvent;
      } catch {
        return;
      }

      setState((prev) => {
        // A frame for a new conversation, or a new turn, starts a fresh buffer;
        // carry-over of the prior turn's text/tools would bleed across bubbles.
        const fresh = prev.forConversation !== conversationId || prev.turnId !== parsed.turnId;
        const base: { forConversation: string } & ChatStreamState = fresh
          ? {
              forConversation: conversationId,
              turnId: parsed.turnId,
              text: "",
              toolEvents: [],
              streaming: true,
              error: null,
            }
          : { ...prev, forConversation: conversationId };

        switch (parsed.type) {
          case "delta":
            return { ...base, streaming: true, text: base.text + parsed.text };
          case "tool":
            return { ...base, streaming: true, toolEvents: [...base.toolEvents, parsed.tool] };
          case "done":
            // `done.text` is the authoritative final text (deltas can drop).
            return { ...base, streaming: false, text: parsed.text };
          case "error":
            return { ...base, streaming: false, error: parsed.message };
          default:
            return base;
        }
      });

      if (parsed.type === "done") {
        // The turn is persisted now — reload the transcript so the finished message
        // (with its toolEvents) renders from the source of truth.
        void qc.invalidateQueries({ queryKey: getChatTranscriptQueryKey(conversationId) });
        void qc.invalidateQueries({ queryKey: getChatTranscriptQueryKey() });
      }
    };

    source.onerror = () => {
      // EventSource reconnects itself; we only surface a hard failure if a turn was
      // mid-flight (a transient blip between turns is silent).
      setState((prev) => (prev.streaming ? { ...prev, streaming: false } : prev));
    };

    return () => source.close();
  }, [conversationId, qc]);

  // Expose EMPTY until a frame for the current conversation has tagged the buffer
  // (covers the null id and the gap right after a conversation switch).
  if (!conversationId || tagged.forConversation !== conversationId) return EMPTY;
  return {
    turnId: tagged.turnId,
    text: tagged.text,
    toolEvents: tagged.toolEvents,
    streaming: tagged.streaming,
    error: tagged.error,
  };
}
