import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "../../test/render";

const push = vi.fn();
// `toggle()` reads the current route to decide whether ⌘J opens `/chat` or leaves
// it — a mutable ref lets individual tests simulate "already on /chat".
const pathnameRef = { current: "/overview" };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathnameRef.current,
}));

import { ChatProvider, useChat } from "./ChatContext";

// A minimal harness exposing every store action + the conversation state as text,
// so tests can drive navigation and assert on the (route-agnostic) state that
// survives it, without needing a real Next.js router or the `/chat` route itself.
function Harness() {
  const { conversationId, messages, open, close, toggle, newChat } = useChat();
  return (
    <div>
      <button data-testid="open" onClick={open} type="button">
        open
      </button>
      <button data-testid="close" onClick={close} type="button">
        close
      </button>
      <button data-testid="toggle" onClick={toggle} type="button">
        toggle
      </button>
      <button data-testid="new-chat" onClick={newChat} type="button">
        new chat
      </button>
      <span data-testid="conversation-id">{conversationId ?? "none"}</span>
      <span data-testid="message-count">{messages.length}</span>
    </div>
  );
}

function fireKey(init: KeyboardEventInit) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { ...init, bubbles: true }));
  });
}

describe("ChatProvider", () => {
  beforeEach(() => {
    push.mockClear();
    pathnameRef.current = "/overview";
  });

  it("mints no conversation until chat is opened", () => {
    renderWithProviders(
      <ChatProvider>
        <Harness />
      </ChatProvider>,
    );
    expect(screen.getByTestId("conversation-id")).toHaveTextContent("none");
  });

  it("open() mints a conversation and navigates to /chat", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ChatProvider>
        <Harness />
      </ChatProvider>,
    );

    await user.click(screen.getByTestId("open"));

    expect(push).toHaveBeenCalledWith("/chat");
    expect(screen.getByTestId("conversation-id")).not.toHaveTextContent("none");
  });

  it("open() twice keeps the same conversation id (no re-mint on an existing thread)", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ChatProvider>
        <Harness />
      </ChatProvider>,
    );

    await user.click(screen.getByTestId("open"));
    const firstId = screen.getByTestId("conversation-id").textContent;

    await user.click(screen.getByTestId("open"));
    expect(screen.getByTestId("conversation-id")).toHaveTextContent(firstId ?? "");
  });

  it("close() navigates back to /overview", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ChatProvider>
        <Harness />
      </ChatProvider>,
    );

    await user.click(screen.getByTestId("close"));
    expect(push).toHaveBeenCalledWith("/overview");
  });

  it("newChat mints a fresh id and clears the transcript", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ChatProvider>
        <Harness />
      </ChatProvider>,
    );

    await user.click(screen.getByTestId("open"));
    const firstId = screen.getByTestId("conversation-id").textContent;

    await user.click(screen.getByTestId("new-chat"));
    expect(screen.getByTestId("conversation-id")).not.toHaveTextContent(firstId ?? "");
    expect(screen.getByTestId("message-count")).toHaveTextContent("0");
  });

  it("⌘/Ctrl+J navigates to /chat from elsewhere in the dashboard", () => {
    renderWithProviders(
      <ChatProvider>
        <Harness />
      </ChatProvider>,
    );

    fireKey({ key: "j", metaKey: true });
    expect(push).toHaveBeenCalledWith("/chat");
  });

  it("⌘/Ctrl+J navigates back to /overview when already on /chat", () => {
    pathnameRef.current = "/chat";
    renderWithProviders(
      <ChatProvider>
        <Harness />
      </ChatProvider>,
    );

    fireKey({ key: "j", metaKey: true });
    expect(push).toHaveBeenCalledWith("/overview");
  });

  it("ignores the key without the modifier", () => {
    renderWithProviders(
      <ChatProvider>
        <Harness />
      </ChatProvider>,
    );
    fireKey({ key: "j" });
    expect(push).not.toHaveBeenCalled();
  });

  it("toggle() via a consumer (the ChatButton path) is equivalent to open()", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ChatProvider>
        <Harness />
      </ChatProvider>,
    );

    await user.click(screen.getByTestId("toggle"));
    expect(push).toHaveBeenCalledWith("/chat");
  });

  it("keeps the transcript across the chat surface unmounting and remounting (route navigation)", async () => {
    const user = userEvent.setup();

    function Wrapper() {
      const { setMessages } = useChat();
      return (
        <>
          <button
            data-testid="add-message"
            onClick={() =>
              setMessages((prev) => [
                ...prev,
                { id: "m1", role: "user", text: "Pamatuj si mě", at: new Date().toISOString() },
              ])
            }
            type="button"
          >
            add
          </button>
          <Harness />
        </>
      );
    }

    const { rerender } = renderWithProviders(
      <ChatProvider>
        <Wrapper />
      </ChatProvider>,
    );

    await user.click(screen.getByTestId("add-message"));
    expect(screen.getByTestId("message-count")).toHaveTextContent("1");

    // Simulate leaving `/chat` (the route — and everything it renders — unmounts)
    // and coming back: the provider sits above the route, so its state persists.
    rerender(
      <ChatProvider>
        <div data-testid="elsewhere" />
      </ChatProvider>,
    );
    rerender(
      <ChatProvider>
        <Wrapper />
      </ChatProvider>,
    );

    expect(screen.getByTestId("message-count")).toHaveTextContent("1");
  });
});
