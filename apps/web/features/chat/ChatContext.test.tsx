import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "../../test/render";
import { installEventSourceMock } from "../../test/eventSourceMock";

// The overlay's stream hook reads API_URL off the env; pin it so the EventSource
// opens. Keep the REAL `apiClient` (via importOriginal) — the mention picker's
// agent/pipeline queries are stubbed at their own hook level below, but other
// modules pulled in transitively through the agents/pipelines barrels (e.g.
// mutation hooks) still reference `apiClient` at import time and would break on a
// bare `{ API_URL }` mock.
vi.mock("../../state/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../state/api")>();
  return { ...actual, API_URL: "http://localhost:3333" };
});
// Sending is fire-and-forget — stub it so toggling the overlay never hits the network.
const mutate = vi.fn();
vi.mock("./mutations/useSendChatMessageMutation", () => ({
  useSendChatMessageMutation: () => ({ mutate, isPending: false }),
}));
// ChatComposer (nested under the overlay) reads the agent/pipeline catalogs for its
// @mention picker (Fáze 14.2) — stub them so this suite never hits the network.
vi.mock("../agents/queries/useAgentsQuery", () => ({
  useAgentsQuery: () => ({ data: [] }),
  getAgentsQueryKey: () => ["agents"],
}));
vi.mock("../pipelines/queries/usePipelinesQuery", () => ({
  usePipelinesQuery: () => ({ data: [] }),
  getPipelinesQueryKey: () => ["pipelines"],
}));

import { ChatProvider, useChat } from "./ChatContext";
import { ChatScreenTestId } from "./components/ChatScreen";
import { ChatComposerTestId } from "./components/ChatComposer";

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
  let mock: ReturnType<typeof installEventSourceMock>;
  beforeEach(() => {
    mock = installEventSourceMock();
    mutate.mockClear();
  });
  afterEach(() => {
    mock.restore();
  });

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

  it("keeps the transcript across close + reopen, and New chat clears it", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ChatProvider>
        <Harness />
      </ChatProvider>,
    );

    // Open and send a turn.
    fireKey({ key: "j", metaKey: true });
    await user.type(screen.getByTestId(ChatComposerTestId.Input), "Pamatuj si mě");
    await user.click(screen.getByTestId(ChatComposerTestId.Send));
    expect(screen.getByText("Pamatuj si mě")).toBeInTheDocument();

    // Close, then reopen — the transcript must still be there (no reset-on-open).
    fireKey({ key: "j", metaKey: true });
    expect(screen.queryByTestId(ChatScreenTestId.Root)).not.toBeInTheDocument();
    fireKey({ key: "j", metaKey: true });
    expect(screen.getByText("Pamatuj si mě")).toBeInTheDocument();

    // New chat is the only reset.
    await user.click(screen.getByTestId(ChatScreenTestId.NewChat));
    expect(screen.queryByText("Pamatuj si mě")).not.toBeInTheDocument();
    expect(screen.getByTestId(ChatScreenTestId.Greeting)).toBeInTheDocument();
  });
});
