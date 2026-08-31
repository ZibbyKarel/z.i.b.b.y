import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ChatMessage as ChatMessageType } from "@zibby/contracts";
import { fireEvent, renderWithProviders as render, screen } from "../../test/render";

/**
 * `Screen` is the reload-hydration wiring (see its docstring): on mount it reads
 * the server's durable transcript and seeds `ChatContext`'s `messages`/
 * `conversationId` from it, guarded so it only ever does so once per
 * conversation. `ChatScreen` (the heavy view, already covered by its own test
 * suite) is stubbed to a thin harness so this suite proves only that wiring.
 *
 * `useChatTranscriptQuery` is mocked keyed by the `conversationId` argument
 * `Screen` passes it (`"__none__"` for "no id yet"), so tests can simulate the
 * server returning *different* transcripts for the no-id request vs. a
 * specific id — the scenario code-review finding #1 (03_review/review.md)
 * flagged: an eager `ensureConversation()` mint racing ahead of the no-id
 * query resolving.
 */

const { chatState } = vi.hoisted(() => ({
  chatState: { conversationId: null as string | null, autoMint: false },
}));

vi.mock("./ChatContext", () => ({
  useChat: () => {
    const [conversationId, setConversationId] = useState<string | null>(chatState.conversationId);
    const [messages, setMessages] = useState<ChatMessageType[]>([]);
    return {
      conversationId,
      // Mirrors the real `ensureConversation`'s idempotent mint-if-absent
      // behaviour, but only when a test opts in (`autoMint`) — the other
      // tests here treat it as the inert no-op it effectively is once a
      // conversationId already exists.
      ensureConversation: () => {
        if (chatState.autoMint) setConversationId((id) => id ?? "conv_client");
      },
      setConversationId,
      messages,
      setMessages,
      newChat: vi.fn(),
      close: vi.fn(),
    };
  },
}));

type Transcript = { conversationId: string; messages: ChatMessageType[] };

const { transcriptByKey } = vi.hoisted(() => ({
  transcriptByKey: new Map<string, Transcript | undefined>(),
}));

function setTranscript(conversationId: string | undefined, value: Transcript | undefined) {
  transcriptByKey.set(conversationId ?? "__none__", value);
}

vi.mock("./queries/useChatTranscriptQuery", () => ({
  useChatTranscriptQuery: (conversationId?: string) => ({
    data: transcriptByKey.get(conversationId ?? "__none__"),
  }),
}));

vi.mock("./components/ChatScreen", () => ({
  ChatScreen: ({
    conversationId,
    messages,
    onMessagesChange,
  }: {
    conversationId: string | null;
    messages: ChatMessageType[];
    onMessagesChange: (updater: (prev: ChatMessageType[]) => ChatMessageType[]) => void;
  }) => (
    <div>
      <span data-testid="conversation-id">{conversationId ?? "none"}</span>
      <span data-testid="message-count">{messages.length}</span>
      <button
        data-testid="append"
        onClick={() =>
          onMessagesChange((prev) => [
            ...prev,
            {
              id: `local-${prev.length}`,
              role: "user",
              text: "hi",
              at: "2026-07-07T00:00:00.000Z",
            },
          ])
        }
        type="button"
      >
        append
      </button>
    </div>
  ),
}));

import { Screen } from "./Screen";

function message(id: string): ChatMessageType {
  return { id, role: "assistant", text: `msg ${id}`, at: "2026-07-07T00:00:00.000Z" };
}

describe("chat Screen — reload hydration", () => {
  it("adopts the server's conversationId and seeds messages on mount", () => {
    chatState.conversationId = null;
    chatState.autoMint = false;
    transcriptByKey.clear();
    setTranscript(undefined, {
      conversationId: "conv_server",
      messages: [message("m1"), message("m2")],
    });

    render(<Screen />);

    expect(screen.getByTestId("conversation-id")).toHaveTextContent("conv_server");
    expect(screen.getByTestId("message-count")).toHaveTextContent("2");
  });

  it("does not clobber messages appended after the initial hydration", () => {
    chatState.conversationId = null;
    chatState.autoMint = false;
    transcriptByKey.clear();
    setTranscript(undefined, { conversationId: "conv_server", messages: [message("m1")] });

    render(<Screen />);
    expect(screen.getByTestId("message-count")).toHaveTextContent("1");

    fireEvent.click(screen.getByTestId("append"));
    expect(screen.getByTestId("message-count")).toHaveTextContent("2");

    // A re-render with the SAME transcript reference (e.g. a background refetch
    // that resolved to an unchanged object) must not re-seed and drop the locally
    // appended message.
    fireEvent.click(screen.getByTestId("append"));
    expect(screen.getByTestId("message-count")).toHaveTextContent("3");
  });

  it("does not re-seed when a background refetch returns a NEW object with the same conversationId (review finding #3)", () => {
    // Unlike the previous test (a stable object reference, which trivially
    // never re-triggers the effect), this rebuilds the transcript as a fresh
    // object with identical content — the actual shape of a real refetch —
    // to prove `hydratedFor` guards on conversationId, not on reference
    // identity happening to be stable.
    chatState.conversationId = null;
    chatState.autoMint = false;
    transcriptByKey.clear();
    setTranscript(undefined, { conversationId: "conv_server", messages: [message("m1")] });

    const { rerender } = render(<Screen />);
    expect(screen.getByTestId("message-count")).toHaveTextContent("1");

    fireEvent.click(screen.getByTestId("append"));
    expect(screen.getByTestId("message-count")).toHaveTextContent("2");

    // New object, same conversationId + same messages — simulates a background
    // GET resolving again with an unchanged transcript.
    setTranscript(undefined, { conversationId: "conv_server", messages: [message("m1")] });
    rerender(<Screen />);

    expect(screen.getByTestId("message-count")).toHaveTextContent("2");
    expect(screen.getByTestId("conversation-id")).toHaveTextContent("conv_server");
  });

  it("renders with no conversation and an empty transcript (cold start)", () => {
    chatState.conversationId = null;
    chatState.autoMint = false;
    transcriptByKey.clear();
    setTranscript(undefined, undefined);

    render(<Screen />);

    expect(screen.getByTestId("conversation-id")).toHaveTextContent("none");
    expect(screen.getByTestId("message-count")).toHaveTextContent("0");
  });

  it(
    "resolves review finding #1: an eager ensureConversation() mint no longer strands " +
      "the server's active thread — it still adopts it on cold start",
    () => {
      // Reproduces 03_review/review.md finding #1: with empty localStorage AND a
      // pre-existing server active thread, the mount effect's `ensureConversation()`
      // mints a client id before the no-id query resolves. Plan §7 edge case 1 calls
      // for adopting the server's real active thread (2 messages) regardless — and
      // the hydration effect (declared after the mint effect, so it runs and
      // commits its `setConversationId`/`setMessages` last in the same effect
      // flush) does exactly that: it overwrites the client mint with the transcript
      // query's authoritative `conversationId`, per `hydratedFor`'s one-shot guard.
      chatState.conversationId = null;
      chatState.autoMint = true; // mirrors the real ensureConversation firing on mount
      transcriptByKey.clear();
      setTranscript(undefined, {
        conversationId: "conv_server",
        messages: [message("m1"), message("m2")],
      });
      setTranscript("conv_client", { conversationId: "conv_client", messages: [] });

      render(<Screen />);

      expect(screen.getByTestId("conversation-id")).toHaveTextContent("conv_server");
      expect(screen.getByTestId("message-count")).toHaveTextContent("2");
    },
  );
});
