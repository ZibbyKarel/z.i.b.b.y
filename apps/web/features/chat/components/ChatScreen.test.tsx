import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "../../../test/render";
import { installEventSourceMock } from "../../../test/eventSourceMock";

// The stream hook reads API_URL off the env; pin it so the EventSource opens. Keep
// the REAL `apiClient` (via importOriginal) — the mention picker's agent/pipeline
// queries are stubbed at their own hook level below, but other modules pulled in
// transitively through the agents/pipelines barrels (e.g. mutation hooks) still
// reference `apiClient` at import time and would break on a bare `{ API_URL }` mock.
vi.mock("../../../state/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../state/api")>();
  return { ...actual, API_URL: "http://localhost:3333" };
});
// Sending is fire-and-forget over the network — stub it so the test drives only
// the optimistic append + the stream, never a real fetch. `sendState.isPending` is
// mutable so individual tests can drive the "thinking" orb mode without a real
// in-flight mutation.
const mutate = vi.fn();
const sendState = { isPending: false };
vi.mock("../mutations/useSendChatMessageMutation", () => ({
  useSendChatMessageMutation: () => ({ mutate, isPending: sendState.isPending }),
}));
// ChatComposer (child) reads the agent/pipeline catalogs for its @mention picker
// (Fáze 14.2) — stub them so this suite never hits the network.
vi.mock("../../agents/queries/useAgentsQuery", () => ({
  useAgentsQuery: () => ({ data: [] }),
  getAgentsQueryKey: () => ["agents"],
}));
vi.mock("../../pipelines/queries/usePipelinesQuery", () => ({
  usePipelinesQuery: () => ({ data: [] }),
  getPipelinesQueryKey: () => ["pipelines"],
}));

import { useState } from "react";
import type { ChatMessage as ChatMessageType } from "@zibby/contracts";
import { ChatScreen, ChatScreenTestId } from "./ChatScreen";
import { ChatComposerTestId } from "./ChatComposer";
import { ChatOrbTestId } from "./ChatOrb";

// The transcript lives in the provider; this harness supplies the lifted state so the
// component behaves exactly as it does under ChatProvider.
function ChatScreenHarness() {
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  return (
    <ChatScreen
      conversationId="c1"
      messages={messages}
      onClose={() => {}}
      onMessagesChange={setMessages}
      onNewChat={() => setMessages([])}
    />
  );
}

describe("ChatScreen", () => {
  let mock: ReturnType<typeof installEventSourceMock>;

  beforeEach(() => {
    mock = installEventSourceMock();
    mutate.mockClear();
    sendState.isPending = false;
  });
  afterEach(() => {
    mock.restore();
  });

  it("keeps the operator's question on screen after the reply lands (no disappear)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ChatScreenHarness />);

    await user.type(screen.getByTestId(ChatComposerTestId.Input), "Jak se máš");
    await user.click(screen.getByTestId(ChatComposerTestId.Send));

    // The user's turn is appended optimistically on send.
    expect(screen.getByText("Jak se máš")).toBeInTheDocument();
    expect(mutate).toHaveBeenCalledWith({ body: { conversationId: "c1", text: "Jak se máš" } });

    // The assistant turn streams in, then completes.
    act(() => {
      mock.last().emit({ conversationId: "c1", turnId: "t1", type: "delta", text: "Mám se" });
      mock.last().emit({ conversationId: "c1", turnId: "t1", type: "done", text: "Mám se dobře." });
    });

    // Regression: BOTH turns remain after `done` — the user's message must not vanish
    // (the old refetch-on-done flashed the transcript empty), and the reply is shown
    // exactly once (the live bubble gave way to the committed message).
    expect(screen.getByText("Jak se máš")).toBeInTheDocument();
    expect(screen.getByText("Mám se dobře.")).toBeInTheDocument();
  });

  it("hides New chat on an empty thread and clears the transcript when used", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ChatScreenHarness />);

    // No turns yet → nothing to reset, so the New chat affordance is absent.
    expect(screen.queryByTestId(ChatScreenTestId.NewChat)).not.toBeInTheDocument();

    await user.type(screen.getByTestId(ChatComposerTestId.Input), "Ahoj");
    await user.click(screen.getByTestId(ChatComposerTestId.Send));
    expect(screen.getByText("Ahoj")).toBeInTheDocument();

    // Once there's a transcript, New chat appears and wipes it back to the greeting.
    await user.click(screen.getByTestId(ChatScreenTestId.NewChat));
    expect(screen.queryByText("Ahoj")).not.toBeInTheDocument();
    expect(screen.getByTestId(ChatScreenTestId.Greeting)).toBeInTheDocument();
  });

  describe("orb mode derivation (Fáze 14.1)", () => {
    it("is idle with no activity", () => {
      renderWithProviders(<ChatScreenHarness />);
      expect(screen.getByTestId(ChatOrbTestId.Root)).toHaveAttribute("data-mode", "idle");
    });

    it("is listening when the composer has a non-empty draft", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ChatScreenHarness />);

      await user.type(screen.getByTestId(ChatComposerTestId.Input), "Ahoj");
      expect(screen.getByTestId(ChatOrbTestId.Root)).toHaveAttribute("data-mode", "listening");
    });

    it("is thinking while the send mutation is pending", () => {
      sendState.isPending = true;
      renderWithProviders(<ChatScreenHarness />);
      expect(screen.getByTestId(ChatOrbTestId.Root)).toHaveAttribute("data-mode", "thinking");
    });

    it("is streaming once tokens are flowing", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ChatScreenHarness />);

      await user.type(screen.getByTestId(ChatComposerTestId.Input), "Jak se máš");
      await user.click(screen.getByTestId(ChatComposerTestId.Send));

      act(() => {
        mock.last().emit({ conversationId: "c1", turnId: "t1", type: "delta", text: "Mám se" });
      });

      expect(screen.getByTestId(ChatOrbTestId.Root)).toHaveAttribute("data-mode", "streaming");
    });

    it("is tool while the last announced tool event is still running", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ChatScreenHarness />);

      await user.type(screen.getByTestId(ChatComposerTestId.Input), "Naplánuj úkol");
      await user.click(screen.getByTestId(ChatComposerTestId.Send));

      act(() => {
        mock.last().emit({
          conversationId: "c1",
          turnId: "t1",
          type: "tool",
          tool: { name: "create_task", status: "started" },
        });
      });

      expect(screen.getByTestId(ChatOrbTestId.Root)).toHaveAttribute("data-mode", "tool");
    });
  });
});
