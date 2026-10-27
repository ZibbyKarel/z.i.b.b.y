import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "../../test/render";

import type { ChatAbout } from "@zibby/contracts";
import { renderHook } from "@testing-library/react";
import { ChatProvider, useChat, useOptionalChat } from "./ChatContext";

// A minimal harness exposing every store action + the conversation/dock state as
// text, so tests can assert on the state the shell-global chat dock reads.
function Harness() {
  const { conversationId, messages, open, newChat, dockOpen, dockTarget, setDockTarget } =
    useChat();
  return (
    <div>
      <button data-testid="open" onClick={() => open()} type="button">
        open
      </button>
      <button
        data-testid="open-dept"
        onClick={() => open({ kind: "department", id: "dev", name: "Development" })}
        type="button"
      >
        open dept
      </button>
      <button data-testid="clear-target" onClick={() => setDockTarget(null)} type="button">
        clear
      </button>
      <span data-testid="dock-open">{String(dockOpen)}</span>
      <span data-testid="dock-target">{dockTarget ? `${dockTarget.kind}` : "auto"}</span>
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
    window.localStorage.clear();
  });

  it("mints no conversation until chat is opened", () => {
    renderWithProviders(
      <ChatProvider>
        <Harness />
      </ChatProvider>,
    );
    expect(screen.getByTestId("conversation-id")).toHaveTextContent("none");
  });

  it("open() mints a conversation and expands the dock (no navigation — ZB-12)", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ChatProvider>
        <Harness />
      </ChatProvider>,
    );

    await user.click(screen.getByTestId("open"));

    expect(screen.getByTestId("dock-open")).toHaveTextContent("true");
    expect(screen.getByTestId("dock-target")).toHaveTextContent("auto");
    expect(screen.getByTestId("conversation-id")).not.toHaveTextContent("none");
  });

  it("open(target) scopes the dock to an explicit department target (O-20), clearable back to automatic routing", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ChatProvider>
        <Harness />
      </ChatProvider>,
    );

    await user.click(screen.getByTestId("open-dept"));
    expect(screen.getByTestId("dock-open")).toHaveTextContent("true");
    expect(screen.getByTestId("dock-target")).toHaveTextContent("department");

    await user.click(screen.getByTestId("clear-target"));
    expect(screen.getByTestId("dock-target")).toHaveTextContent("auto");
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

  it("⌘/Ctrl+J toggles the dock and mints a conversation", () => {
    renderWithProviders(
      <ChatProvider>
        <Harness />
      </ChatProvider>,
    );

    fireKey({ key: "j", metaKey: true });
    expect(screen.getByTestId("dock-open")).toHaveTextContent("true");
    expect(screen.getByTestId("conversation-id")).not.toHaveTextContent("none");

    fireKey({ key: "j", ctrlKey: true });
    expect(screen.getByTestId("dock-open")).toHaveTextContent("false");
  });

  it("ignores the key without the modifier", () => {
    renderWithProviders(
      <ChatProvider>
        <Harness />
      </ChatProvider>,
    );
    fireKey({ key: "j" });
    expect(screen.getByTestId("dock-open")).toHaveTextContent("false");
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

  it("initialises conversationId from a conversation persisted before this reload", () => {
    window.localStorage.setItem("zibby.chat.conversationId", "conv_from_disk");

    renderWithProviders(
      <ChatProvider>
        <Harness />
      </ChatProvider>,
    );

    expect(screen.getByTestId("conversation-id")).toHaveTextContent("conv_from_disk");
  });

  it("persists a newly-minted conversation id to localStorage (survives the next reload)", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ChatProvider>
        <Harness />
      </ChatProvider>,
    );

    await user.click(screen.getByTestId("open"));
    const id = screen.getByTestId("conversation-id").textContent;

    expect(window.localStorage.getItem("zibby.chat.conversationId")).toBe(id);
  });

  it("persists newChat's fresh id, replacing the previous one", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ChatProvider>
        <Harness />
      </ChatProvider>,
    );

    await user.click(screen.getByTestId("open"));
    await user.click(screen.getByTestId("new-chat"));
    const id = screen.getByTestId("conversation-id").textContent;

    expect(window.localStorage.getItem("zibby.chat.conversationId")).toBe(id);
  });
});

describe("ChatProvider — about (todo-29)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  const A: ChatAbout = { kind: "pr", id: "u", label: "PR #1", details: "one" };

  function renderStore() {
    return renderHook(() => useChat(), {
      wrapper: ({ children }) => <ChatProvider>{children}</ChatProvider>,
    });
  }

  it("openAbout opens the dock, sets about and mints a conversation", () => {
    const { result } = renderStore();
    act(() => result.current.openAbout(A));
    expect(result.current.dockOpen).toBe(true);
    expect(result.current.about).toEqual(A);
    expect(result.current.conversationId).toMatch(/^conv_/);
  });

  it("re-opening the same item keeps the thread and refreshes details", () => {
    const { result } = renderStore();
    act(() => result.current.openAbout(A));
    const id = result.current.conversationId;
    act(() =>
      result.current.setMessages([
        { id: "m", role: "user", text: "t", at: "2026-10-27T00:00:00Z" },
      ]),
    );
    act(() => result.current.openAbout({ ...A, details: "two" }));
    expect(result.current.conversationId).toBe(id);
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.about?.details).toBe("two");
  });

  it("a different item starts a fresh conversation", () => {
    const { result } = renderStore();
    act(() => result.current.openAbout(A));
    const id = result.current.conversationId;
    act(() =>
      result.current.setMessages([
        { id: "m", role: "user", text: "t", at: "2026-10-27T00:00:00Z" },
      ]),
    );
    const B: ChatAbout = { kind: "pr", id: "v", label: "PR #2" };
    act(() => result.current.openAbout(B));
    expect(result.current.conversationId).not.toBe(id);
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.about).toEqual(B);
  });

  it("newChat clears about", () => {
    const { result } = renderStore();
    act(() => result.current.openAbout(A));
    act(() => result.current.newChat());
    expect(result.current.about).toBeNull();
  });

  it("useOptionalChat returns null outside the provider", () => {
    const { result } = renderHook(() => useOptionalChat());
    expect(result.current).toBeNull();
  });
});
