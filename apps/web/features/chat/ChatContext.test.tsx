import { describe, expect, it } from "vitest";
import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "../../test/render";
import { ChatProvider, useChat } from "./ChatContext";
import { ChatScreenTestId } from "./components/ChatScreen";

// A minimal trigger so the provider has a button to toggle the overlay.
function Harness() {
  const { toggle } = useChat();
  return (
    <button data-testid="harness-toggle" onClick={toggle} type="button">
      toggle
    </button>
  );
}

function fireKey(init: KeyboardEventInit) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { ...init, bubbles: true }));
  });
}

describe("ChatProvider", () => {
  it("does not render the overlay until opened", () => {
    renderWithProviders(
      <ChatProvider>
        <Harness />
      </ChatProvider>,
    );
    expect(screen.queryByTestId(ChatScreenTestId.Root)).not.toBeInTheDocument();
  });

  it("toggles the overlay on ⌘/Ctrl+J", () => {
    renderWithProviders(
      <ChatProvider>
        <Harness />
      </ChatProvider>,
    );

    fireKey({ key: "j", metaKey: true });
    expect(screen.getByTestId(ChatScreenTestId.Root)).toBeInTheDocument();

    fireKey({ key: "j", metaKey: true });
    expect(screen.queryByTestId(ChatScreenTestId.Root)).not.toBeInTheDocument();
  });

  it("ignores the key without the modifier", () => {
    renderWithProviders(
      <ChatProvider>
        <Harness />
      </ChatProvider>,
    );
    fireKey({ key: "j" });
    expect(screen.queryByTestId(ChatScreenTestId.Root)).not.toBeInTheDocument();
  });

  it("toggles via a consumer (the ChatButton path)", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ChatProvider>
        <Harness />
      </ChatProvider>,
    );
    await user.click(screen.getByTestId("harness-toggle"));
    expect(screen.getByTestId(ChatScreenTestId.Root)).toBeInTheDocument();
  });
});
