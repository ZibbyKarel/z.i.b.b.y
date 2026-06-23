import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "../../../test/render";
import { installEventSourceMock } from "../../../test/eventSourceMock";

// The stream hook reads API_URL off the env; pin it so the EventSource opens.
vi.mock("../../../state/api", () => ({ API_URL: "http://localhost:3333" }));
// Sending is fire-and-forget over the network — stub it so the test drives only
// the optimistic append + the stream, never a real fetch.
const mutate = vi.fn();
vi.mock("../mutations/useSendChatMessageMutation", () => ({
  useSendChatMessageMutation: () => ({ mutate, isPending: false }),
}));

import { useState } from "react";
import type { ChatMessage as ChatMessageType } from "@zibby/contracts";
import { ChatScreen, ChatScreenTestId } from "./ChatScreen";
import { ChatComposerTestId } from "./ChatComposer";

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
});
