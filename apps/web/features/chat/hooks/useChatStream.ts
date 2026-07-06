import { useEffect, useRef, useState } from "react";
import type { ChatToolEvent } from "@zibby/contracts";
import { API_URL } from "../../../state/api";

/**
 * The live state of the assistant's in-progress turn, accumulated from the SSE
 * token stream. Consumers render `text` as a streaming bubble while `streaming`
 * is true; `toolEvents` are inline dispatch announcements. Once a turn finishes
 * the buffer resets to {@link EMPTY} and the finished turn is handed to
 * {@link ChatStreamHandlers.onComplete} — there is no persisted refetch.
 */
export interface ChatStreamState {
  /** The turn currently streaming, or `null` between turns. */
  turnId: string | null;
  /** Accumulated assistant text for the current turn. */
  text: string;
  /** Tool events announced during the current turn, in arrival order. */
  toolEvents: ChatToolEvent[];
  /** True between the first delta/tool and the terminal `done`/`error`. */
  streaming: boolean;
  /** Terminal stream error for the just-ended turn, if it failed. */
  error: string | null;
}

/** The finished assistant turn, handed to {@link ChatStreamHandlers.onComplete}. */
export interface CompletedTurn {
  turnId: string;
  text: string;
  toolEvents: ChatToolEvent[];
}

/**
 * Side-effect callbacks fired once per turn. The conversation lives in the
 * caller's client state (the chat overlay is ephemeral — reset on reopen), so the
 * hook hands the finished turn back rather than invalidating a query. `onComplete`
 * fires on the terminal `done`; `onError` on a terminal `error`.
 */
export interface ChatStreamHandlers {
  onComplete?: (turn: CompletedTurn) => void;
  onError?: (message: string) => void;
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
 * Deltas accumulate into a per-turn buffer (mirrored in a ref so the terminal
 * frame can hand back the whole turn without reading React state). On `done` the
 * authoritative `done.text` plus the accumulated tool events are handed to
 * `onComplete` and the live buffer resets in the SAME update — so the streaming
 * bubble vanishes exactly as the caller commits the persisted message, with no
 * empty frame in between (this is what fixed "history zmizela": there is no
 * refetch window to flash through).
 *
 * A `tool` frame is two-phase for `create_task` (backend `chat-session.service`):
 * a `started` frame lands the instant the dispatch is announced, then an `ok`
 * frame with the same `callId` lands once the structured result (target/runRef/
 * taskId/href) is known. When an incoming `tool` frame's `callId` matches one
 * already buffered, it REPLACES that entry in place (so the transcript shows one
 * live-updating row, not a duplicate); a frame without a matching `callId` (no
 * correlation, or a single-phase tool like `recall_memory`) is appended as usual.
 *
 * The stream is scoped to the hook's lifetime: it opens when a `conversationId` is
 * known and closes on unmount (the overlay closing). A `null` conversationId is
 * inert (nothing to stream yet).
 */
export function useChatStream(
  conversationId: string | null,
  handlers: ChatStreamHandlers = {},
): ChatStreamState {
  const [tagged, setState] = useState<{ forConversation: string | null } & ChatStreamState>({
    forConversation: null,
    ...EMPTY,
  });

  // The terminal frame commits via the caller's handlers; keep them in a ref so a
  // changed handler identity doesn't tear down and re-open the stream. Synced in an
  // effect (a ref must not be written during render).
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  // A mutable mirror of the in-flight turn so `done`/`error` can hand back the full
  // accumulated text + tools without depending on the async React state.
  const bufferRef = useRef<CompletedTurn>({ turnId: "", text: "", toolEvents: [] });

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

      // A new turn id starts a fresh accumulation buffer.
      if (bufferRef.current.turnId !== parsed.turnId) {
        bufferRef.current = { turnId: parsed.turnId, text: "", toolEvents: [] };
      }
      const buf = bufferRef.current;

      switch (parsed.type) {
        case "delta":
          buf.text += parsed.text;
          setState({
            forConversation: conversationId,
            turnId: parsed.turnId,
            text: buf.text,
            toolEvents: buf.toolEvents,
            streaming: true,
            error: null,
          });
          break;
        case "tool": {
          // A `callId` match REPLACES the buffered entry (the create_task started→ok
          // pair collapses to one row); otherwise append.
          const matchIndex = parsed.tool.callId
            ? buf.toolEvents.findIndex((event) => event.callId === parsed.tool.callId)
            : -1;
          buf.toolEvents =
            matchIndex !== -1
              ? buf.toolEvents.map((event, i) => (i === matchIndex ? parsed.tool : event))
              : [...buf.toolEvents, parsed.tool];
          setState({
            forConversation: conversationId,
            turnId: parsed.turnId,
            text: buf.text,
            toolEvents: buf.toolEvents,
            streaming: true,
            error: null,
          });
          break;
        }
        case "done": {
          // `done.text` is authoritative (deltas can drop). Hand the finished turn
          // to the caller and reset the live buffer in the same React batch.
          const finalText = parsed.text || buf.text;
          handlersRef.current.onComplete?.({
            turnId: parsed.turnId,
            text: finalText,
            toolEvents: buf.toolEvents,
          });
          bufferRef.current = { turnId: "", text: "", toolEvents: [] };
          setState({ forConversation: conversationId, ...EMPTY });
          break;
        }
        case "error":
          handlersRef.current.onError?.(parsed.message);
          bufferRef.current = { turnId: "", text: "", toolEvents: [] };
          setState({ forConversation: conversationId, ...EMPTY, error: parsed.message });
          break;
        default:
          break;
      }
    };

    source.onerror = () => {
      // EventSource reconnects itself; we only drop the streaming flag if a turn was
      // mid-flight (a transient blip between turns is silent).
      setState((prev) => (prev.streaming ? { ...prev, streaming: false } : prev));
    };

    return () => source.close();
  }, [conversationId]);

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
