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
// (Fáze 14.2); the ⌘K palette (Fáze 14.5) reads the same two plus gates/memory —
// stub every one (with one fixture each, reused by the 14.5 wiring tests below) so
// this suite never hits the network.
vi.mock("../../agents/queries/useAgentsQuery", () => ({
  useAgentsQuery: () => ({ data: [{ id: "builder", name: "Builder", glyph: "hammer" }] }),
  getAgentsQueryKey: () => ["agents"],
}));
vi.mock("../../pipelines/queries/usePipelinesQuery", () => ({
  usePipelinesQuery: () => ({ data: [] }),
  getPipelinesQueryKey: () => ["pipelines"],
}));
vi.mock("../../approvals/queries/useApprovalsQuery", () => ({
  useApprovalsQuery: () => ({
    data: [
      {
        id: "ap1",
        runId: "r1",
        kind: "agent",
        skill: "writer",
        action: "purchase",
        detail: "buy the domain",
        risk: "low",
        status: "pending",
        requestedAt: "2026-06-12T07:00:00.000Z",
      },
    ],
    isPending: false,
  }),
  getApprovalsQueryKey: () => ["approvals"],
}));
vi.mock("../../memory/queries/useMemorySearchQuery", () => ({
  useMemorySearchQuery: () => ({ data: undefined, isFetching: false }),
  getMemorySearchQueryKey: (q: string) => ["memory", "search", q],
}));
vi.mock("../../overview/queries/useActivityQuery", () => ({
  useActivityQuery: () => ({ data: [], isPending: false }),
  getActivityQueryKey: () => ["activity", "today"],
}));
// The top-bar `ProjectSwitcher` (Phase 33) reads the app-wide project registry
// and the active-project scope — stub both the same way `NewTaskDialog.test.tsx`
// does, since this suite never mounts the real `ProjectProvider`.
vi.mock("../../projects/queries/useProjectsQuery", () => ({
  useProjectsQuery: () => ({ data: [{ id: "alpha", name: "Alpha" }] }),
  getProjectsQueryKey: () => ["projects"],
}));
vi.mock("../../projects/context/ProjectProvider", () => ({
  useActiveProject: () => ({ activeProjectId: null, setActiveProject: vi.fn() }),
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
// `ChatScreen` reads `usePipelineRunQuery` (the same aggregate `ChatRunCard` polls,
// Rozhodnutí 5, Fáze 15.3) to derive the `waiting-approval` orb mode. Mock only that
// one export off the barrel — `ChatComposer`/`ChatPalette` also import
// `usePipelinesQuery` from the same barrel (already stubbed above at its own module
// path), so this keeps the real barrel wiring for everything else.
const { pipelineRunMock } = vi.hoisted(() => ({
  pipelineRunMock: vi.fn((_runId: string | null) => ({ data: undefined as { status: string } | undefined })),
}));
vi.mock("../../pipelines", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../pipelines")>();
  return { ...actual, usePipelineRunQuery: pipelineRunMock };
});

import { useState } from "react";
import type { ChatMessage as ChatMessageType } from "@zibby/contracts";
import { SearchBarTestId, SearchMenuTestId } from "@zibby/design-system";
import { ChatScreen, ChatScreenTestId } from "./ChatScreen";
import { ChatComposerTestId } from "./ChatComposer";
import { CosmicSceneTestId } from "../scene/CosmicScene";
import { ChatPaletteTestId } from "./ChatPalette";
import { ChatSidePanelTestId } from "./ChatSidePanel";

// The transcript lives in the provider; this harness supplies the lifted state so the
// component behaves exactly as it does under ChatProvider. `onClose` is spy-able so
// the Esc-priority / palette-navigate tests can assert it fired (or didn't).
function ChatScreenHarness({ onClose = () => {} }: { onClose?: () => void }) {
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  return (
    <ChatScreen
      conversationId="c1"
      messages={messages}
      onClose={onClose}
      onMessagesChange={setMessages}
      onNewChat={() => setMessages([])}
    />
  );
}

function fireKey(init: KeyboardEventInit) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { ...init, bubbles: true }));
  });
}

describe("ChatScreen", () => {
  let mock: ReturnType<typeof installEventSourceMock>;

  beforeEach(() => {
    mock = installEventSourceMock();
    mutate.mockClear();
    sendState.isPending = false;
    push.mockClear();
    pipelineRunMock.mockReset();
    pipelineRunMock.mockReturnValue({ data: undefined });
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
      expect(screen.getByTestId(CosmicSceneTestId.Root)).toHaveAttribute("data-mode", "idle");
    });

    it("is listening when the composer has a non-empty draft", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ChatScreenHarness />);

      await user.type(screen.getByTestId(ChatComposerTestId.Input), "Ahoj");
      expect(screen.getByTestId(CosmicSceneTestId.Root)).toHaveAttribute("data-mode", "listening");
    });

    it("is thinking while the send mutation is pending", () => {
      sendState.isPending = true;
      renderWithProviders(<ChatScreenHarness />);
      expect(screen.getByTestId(CosmicSceneTestId.Root)).toHaveAttribute("data-mode", "thinking");
    });

    it("is streaming once tokens are flowing", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ChatScreenHarness />);

      await user.type(screen.getByTestId(ChatComposerTestId.Input), "Jak se máš");
      await user.click(screen.getByTestId(ChatComposerTestId.Send));

      act(() => {
        mock.last().emit({ conversationId: "c1", turnId: "t1", type: "delta", text: "Mám se" });
      });

      expect(screen.getByTestId(CosmicSceneTestId.Root)).toHaveAttribute("data-mode", "streaming");
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

      expect(screen.getByTestId(CosmicSceneTestId.Root)).toHaveAttribute("data-mode", "tool");
    });

    it("is error when the stream ends the turn with a terminal error frame (Fáze 15.3)", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ChatScreenHarness />);

      await user.type(screen.getByTestId(ChatComposerTestId.Input), "Jak se máš");
      await user.click(screen.getByTestId(ChatComposerTestId.Send));

      act(() => {
        mock.last().emit({ conversationId: "c1", turnId: "t1", type: "error", message: "boom" });
      });

      expect(screen.getByTestId(CosmicSceneTestId.Root)).toHaveAttribute("data-mode", "error");
    });

    it("is waiting-approval when the last dispatched run is parked on the operator's decision (Fáze 15.3)", async () => {
      pipelineRunMock.mockReturnValue({ data: { status: "awaiting-approval" } });
      const user = userEvent.setup();
      renderWithProviders(<ChatScreenHarness />);

      await user.type(screen.getByTestId(ChatComposerTestId.Input), "Naplánuj úkol");
      await user.click(screen.getByTestId(ChatComposerTestId.Send));

      act(() => {
        mock.last().emit({
          conversationId: "c1",
          turnId: "t1",
          type: "tool",
          tool: { name: "create_task", status: "ok", runRef: "delivery_1" },
        });
      });

      expect(screen.getByTestId(CosmicSceneTestId.Root)).toHaveAttribute("data-mode", "waiting-approval");
    });
  });

  describe("activity panel + quick-switcher (Fáze 14.5)", () => {
    it("toggles the activity panel from the top-bar button", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ChatScreenHarness />);

      expect(screen.queryByTestId(ChatSidePanelTestId.Root)).not.toBeInTheDocument();
      await user.click(screen.getByTestId(ChatScreenTestId.PanelToggle));
      expect(screen.getByTestId(ChatSidePanelTestId.Root)).toBeInTheDocument();
      await user.click(screen.getByTestId(ChatScreenTestId.PanelToggle));
      expect(screen.queryByTestId(ChatSidePanelTestId.Root)).not.toBeInTheDocument();
    });

    it("opens the palette from the search bar, closing the panel it replaces (mutually exclusive)", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ChatScreenHarness />);

      await user.click(screen.getByTestId(ChatScreenTestId.PanelToggle));
      expect(screen.getByTestId(ChatSidePanelTestId.Root)).toBeInTheDocument();

      await user.click(screen.getByTestId(SearchBarTestId.Root));
      expect(screen.getByTestId(ChatPaletteTestId.Root)).toBeInTheDocument();
      expect(screen.queryByTestId(ChatSidePanelTestId.Root)).not.toBeInTheDocument();

      // And the reverse: reopening the panel closes the palette back out.
      await user.click(screen.getByTestId(ChatScreenTestId.PanelToggle));
      expect(screen.getByTestId(ChatSidePanelTestId.Root)).toBeInTheDocument();
      expect(screen.queryByTestId(ChatPaletteTestId.Root)).not.toBeInTheDocument();
    });

    it("⌘K opens the palette, and Esc closes it (Fáze 30)", async () => {
      renderWithProviders(<ChatScreenHarness />);

      expect(screen.queryByTestId(ChatPaletteTestId.Root)).not.toBeInTheDocument();
      fireKey({ key: "k", metaKey: true });
      expect(screen.getByTestId(ChatPaletteTestId.Root)).toBeInTheDocument();

      fireKey({ key: "Escape" });
      expect(screen.queryByTestId(ChatPaletteTestId.Root)).not.toBeInTheDocument();
    });

    it("Ctrl+K toggles the palette closed on a second press, same as the search bar (Fáze 30)", async () => {
      renderWithProviders(<ChatScreenHarness />);

      fireKey({ key: "k", ctrlKey: true });
      expect(screen.getByTestId(ChatPaletteTestId.Root)).toBeInTheDocument();
      fireKey({ key: "k", ctrlKey: true });
      expect(screen.queryByTestId(ChatPaletteTestId.Root)).not.toBeInTheDocument();
    });

    it("Esc closes the panel, then does nothing further (no overlay left to close)", async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<ChatScreenHarness onClose={onClose} />);

      await user.click(screen.getByTestId(ChatScreenTestId.PanelToggle));
      expect(screen.getByTestId(ChatSidePanelTestId.Root)).toBeInTheDocument();

      // 1st Esc: the panel closes.
      fireKey({ key: "Escape" });
      expect(screen.queryByTestId(ChatSidePanelTestId.Root)).not.toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();

      // 2nd Esc: nothing else open — a routed page, so nothing happens.
      fireKey({ key: "Escape" });
      expect(onClose).not.toHaveBeenCalled();
    });

    it("Esc closes the palette, then does nothing further (no overlay left to close)", async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<ChatScreenHarness onClose={onClose} />);

      await user.click(screen.getByTestId(SearchBarTestId.Root));
      expect(screen.getByTestId(ChatPaletteTestId.Root)).toBeInTheDocument();

      // 1st Esc: the palette closes.
      fireKey({ key: "Escape" });
      expect(screen.queryByTestId(ChatPaletteTestId.Root)).not.toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();

      // 2nd Esc: nothing else open — a routed page, so nothing happens.
      fireKey({ key: "Escape" });
      expect(onClose).not.toHaveBeenCalled();
    });

    it("selecting an agent in the palette injects an @mention target into the composer", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ChatScreenHarness />);

      await user.click(screen.getByTestId(SearchBarTestId.Root));
      await user.type(screen.getByTestId(SearchMenuTestId.Input), "Bui");
      await user.click(screen.getByTestId(`${SearchMenuTestId.Item}-agents-builder`));

      expect(screen.queryByTestId(ChatPaletteTestId.Root)).not.toBeInTheDocument();
      expect(screen.getByTestId(ChatComposerTestId.TargetChip)).toHaveTextContent("Builder");
      expect(screen.getByTestId(ChatComposerTestId.Input)).toHaveValue("@Builder ");

      await user.type(screen.getByTestId(ChatComposerTestId.Input), "ahoj");
      await user.keyboard("{Enter}");
      expect(mutate).toHaveBeenCalledWith({
        body: {
          conversationId: "c1",
          text: "@Builder ahoj",
          target: { kind: "agent", id: "builder", name: "Builder", glyph: "hammer" },
        },
      });
    });

    it("selecting a gate in the palette navigates, without closing the page", async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<ChatScreenHarness onClose={onClose} />);

      await user.click(screen.getByTestId(SearchBarTestId.Root));
      await user.type(screen.getByTestId(SearchMenuTestId.Input), "purchase");
      await user.click(screen.getByTestId(`${SearchMenuTestId.Item}-gates-ap1`));

      expect(push).toHaveBeenCalledWith("/gates");
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
