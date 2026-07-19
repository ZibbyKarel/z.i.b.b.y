import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen, within } from "../../../test/render";
import { installEventSourceMock } from "../../../test/eventSourceMock";

// The chat stream (owned by the bottom bar's `ChatDock` now) reads `API_URL` off the
// env; pin it so the EventSource opens. Keep the REAL `apiClient` (via
// importOriginal) — modules pulled in transitively through the agents/pipelines
// barrels still reference `apiClient` at import time and would break on a bare mock.
vi.mock("../../../state/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../state/api")>();
  return { ...actual, API_URL: "http://localhost:3333" };
});
// Sending is fire-and-forget over the network — stub it so the test drives only the
// optimistic append + the stream, never a real fetch.
const mutate = vi.fn();
const sendState = { isPending: false };
vi.mock("../mutations/useSendChatMessageMutation", () => ({
  useSendChatMessageMutation: () => ({ mutate, isPending: sendState.isPending }),
}));
// `CommandLine` (the chat composer inside `ChatDock`) reads the agent/pipeline
// catalogs for its `@`-mention picker; the ⌘K palette reads the same two plus
// memory — stub every one (with one fixture each, reused by the palette
// wiring tests below) so this suite never hits the network.
vi.mock("../../agents/queries/useAgentsQuery", () => ({
  useAgentsQuery: () => ({ data: [{ id: "builder", name: "Builder", glyph: "hammer" }] }),
  getAgentsQueryKey: () => ["agents"],
}));
vi.mock("../../pipelines/queries/usePipelinesQuery", () => ({
  usePipelinesQuery: () => ({ data: [] }),
  getPipelinesQueryKey: () => ["pipelines"],
}));
// The Phase 83 subsystem web polls the subsystem-federation registry — stub it with a
// couple of fixtures (one idle, one running) so the orb map has something concrete to
// render and the suite never hits the network.
vi.mock("../../subsystems/queries/useSubsystemsQuery", () => ({
  useSubsystemsQuery: () => ({
    data: [
      {
        id: "forge",
        name: "Forge",
        tagline: "Kovárna doručení",
        mandate: "…",
        color: "#f97316",
        state: "idle",
        tier2Count: 0,
        tier3Count: 0,
      },
      {
        id: "puls",
        name: "Puls",
        tagline: "Tep systému",
        mandate: "…",
        color: "#14b8a6",
        state: "running",
        tier2Count: 0,
        tier3Count: 0,
      },
    ],
  }),
  getSubsystemsQueryKey: () => ["subsystems"],
}));
// `CommandLine` also reads the limits query (its schedule menu, and the top bar's
// limits gauge) and the attachment-upload mutation — stub both so mounting never hits
// the network, matching `CommandLine.test.tsx`'s own mocking pattern.
vi.mock("../../limits/queries/useLimitsQuery", () => ({
  useLimitsQuery: () => ({
    data: {
      rolling: { usedPct: 10, resetsAt: null },
      weekly: { usedPct: 5, resetsAt: null },
      capturedAt: Date.now(),
      stale: false,
    },
  }),
}));
vi.mock("../../tasks/mutations/useUploadTaskAttachmentsMutation", () => ({
  useUploadTaskAttachmentsMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
// The top bar's status pill reads the approvals feed.
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
// `CommandLine`'s inline project picker (Phase 102/108) reads the project registry.
vi.mock("../../projects/queries/useProjectsQuery", () => ({
  useProjectsQuery: () => ({ data: [{ id: "alpha", name: "Alpha" }] }),
  getProjectsQueryKey: () => ["projects"],
}));
// The `/settings` voice pick — read by every `ChatMessage`'s read-aloud button.
vi.mock("../../system", () => ({ useSystemConfigQuery: () => ({ data: undefined }) }));
// The bottom-right `ChatLiveLog` reuses the HUD RightRail's activity wiring — stub both
// queries so the widget renders its collapsed toggle without hitting the network.
vi.mock("../../activity/queries/useActivityFeedInfiniteQuery", () => ({
  useActivityFeedInfiniteQuery: () => ({ data: undefined }),
  getActivityFeedQueryKey: () => ["activity", "feed"],
  prependActivityEntry: vi.fn(),
}));
vi.mock("../../settings/queries/useActivityViewQuery", () => ({
  useActivityViewQuery: () => ({ data: undefined }),
  getActivityViewQueryKey: () => ["activity", "view"],
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { useState } from "react";
import type { ChatMessage as ChatMessageType } from "@zibby/contracts";
import {
  EntityHeroTestId,
  MAIN_CONTENT_ID,
  OrbMapTestId,
  OrbNodeTestId,
  SearchBarTestId,
  SearchMenuTestId,
} from "@zibby/design-system";
import { ChatScreen, ChatScreenTestId } from "./ChatScreen";
import { ChatTopBarTestId } from "./ChatTopBar";
import { ChatToolDockTestId } from "./ChatToolDock";
import { ChatBottomBarTestId } from "./ChatBottomBar";
import { ChatLiveLogTestId } from "./ChatLiveLog";
import { CommandLineTestId } from "../../tasks/components/CommandLine/CommandLine";
import { SubsystemDrawerTestId } from "../../subsystems/components/SubsystemDrawer/SubsystemDrawer";
import { ChatDetailDialogTestId } from "./ChatDetailDialog";
import { ChatPaletteTestId } from "./ChatPalette";
import { SubsystemOrbMapTestId } from "./SubsystemOrbMap";

// The transcript lives in the provider; this harness supplies the lifted state so the
// screen behaves exactly as it does under `ChatProvider`.
function ChatScreenHarness() {
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  return (
    <ChatScreen
      conversationId="c1"
      messages={messages}
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
  });
  afterEach(() => {
    mock.restore();
  });

  it("mounts the Velín-D shell chrome: top bar, tool dock, orb map, bottom bar and live log", () => {
    renderWithProviders(<ChatScreenHarness />);

    expect(screen.getByTestId(ChatScreenTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(ChatTopBarTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(ChatToolDockTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(SubsystemOrbMapTestId.Root)).toBeInTheDocument();
    // The transcript + composer moved into the bottom bar's chat dock (Task 6); the
    // live-log mini-widget mounts bottom-right. Both are present.
    expect(screen.getByTestId(ChatBottomBarTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(ChatLiveLogTestId.Root)).toBeInTheDocument();
  });

  it("renders as the page's sole main landmark, focusable from the skip link", () => {
    renderWithProviders(<ChatScreenHarness />);

    const root = screen.getByTestId(ChatScreenTestId.Root);
    expect(root).toHaveRole("main");
    expect(root).toHaveAttribute("id", MAIN_CONTENT_ID);
    expect(root).toHaveAttribute("tabIndex", "-1");
  });

  it("routes the composer through the bottom bar's chat dock — a send appends and dispatches", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ChatScreenHarness />);

    // The only composer left on the screen is the chat dock's `CommandLine`, mounted
    // through `ChatBottomBar` (chat slot active by default).
    await user.type(screen.getByTestId(CommandLineTestId.Input), "Jak se máš");
    await user.click(screen.getByTestId(CommandLineTestId.Send));

    expect(screen.getByText("Jak se máš")).toBeInTheDocument();
    expect(mutate).toHaveBeenCalledWith({ body: { conversationId: "c1", text: "Jak se máš" } });
  });

  it("has no project control at all — chat is send-delegation only (Phase 118d)", () => {
    renderWithProviders(<ChatScreenHarness />);
    expect(screen.queryByTestId("project-switcher")).not.toBeInTheDocument();
    expect(screen.queryByTestId("task-command-line-project-selector")).not.toBeInTheDocument();
  });

  describe("subsystem orb map (Task 13)", () => {
    it("renders the map with all mocked subsystems, over the scene", () => {
      renderWithProviders(<ChatScreenHarness />);

      expect(screen.getByTestId(SubsystemOrbMapTestId.Root)).toBeInTheDocument();
      expect(screen.getByTestId(`${OrbMapTestId.Node}-forge`)).toBeInTheDocument();
      expect(screen.getByTestId(`${OrbMapTestId.Node}-puls`)).toBeInTheDocument();
    });

    it("clicking a node opens the drawer for that subsystem, and picking a different node swaps it", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ChatScreenHarness />);

      expect(screen.queryByTestId(SubsystemDrawerTestId.Root)).not.toBeInTheDocument();

      const forgeButton = within(screen.getByTestId(`${OrbMapTestId.Node}-forge`)).getByTestId(
        OrbNodeTestId.Root,
      );
      await user.click(forgeButton);
      expect(screen.getByTestId(SubsystemDrawerTestId.Root)).toBeInTheDocument();
      expect(screen.getByTestId(SubsystemDrawerTestId.Name)).toHaveTextContent("Forge");

      // Selecting a different node swaps the drawer's content — only one open at a time.
      const pulsButton = within(screen.getByTestId(`${OrbMapTestId.Node}-puls`)).getByTestId(
        OrbNodeTestId.Root,
      );
      await user.click(pulsButton);
      expect(screen.getByTestId(SubsystemDrawerTestId.Name)).toHaveTextContent("Puls");
    });
  });

  describe("quick-switcher (Phase 14.5)", () => {
    it("⌘K opens the palette, and Esc closes it (Phase 30)", () => {
      renderWithProviders(<ChatScreenHarness />);

      expect(screen.queryByTestId(ChatPaletteTestId.Root)).not.toBeInTheDocument();
      fireKey({ key: "k", metaKey: true });
      expect(screen.getByTestId(ChatPaletteTestId.Root)).toBeInTheDocument();

      fireKey({ key: "Escape" });
      expect(screen.queryByTestId(ChatPaletteTestId.Root)).not.toBeInTheDocument();
    });

    it("Ctrl+K toggles the palette closed on a second press, same as the search bar (Phase 30)", () => {
      renderWithProviders(<ChatScreenHarness />);

      fireKey({ key: "k", ctrlKey: true });
      expect(screen.getByTestId(ChatPaletteTestId.Root)).toBeInTheDocument();
      fireKey({ key: "k", ctrlKey: true });
      expect(screen.queryByTestId(ChatPaletteTestId.Root)).not.toBeInTheDocument();
    });

    it("Esc closes the palette, then does nothing further (no overlay left to close)", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ChatScreenHarness />);

      await user.click(screen.getByTestId(SearchBarTestId.Root));
      expect(screen.getByTestId(ChatPaletteTestId.Root)).toBeInTheDocument();

      // 1st Esc: the palette closes.
      fireKey({ key: "Escape" });
      expect(screen.queryByTestId(ChatPaletteTestId.Root)).not.toBeInTheDocument();

      // 2nd Esc: nothing else open — a routed page, so nothing happens.
      fireKey({ key: "Escape" });
    });

    it("selecting an agent in the palette opens its detail dialog, not composer injection (Phase 58)", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ChatScreenHarness />);

      await user.click(screen.getByTestId(SearchBarTestId.Root));
      await user.type(screen.getByTestId(SearchMenuTestId.Input), "Bui");
      await user.click(screen.getByTestId(`${SearchMenuTestId.Item}-agents-builder`));

      // The pick closes the palette and opens the agent's read-only detail dialog.
      expect(screen.queryByTestId(ChatPaletteTestId.Root)).not.toBeInTheDocument();
      expect(screen.getByTestId(ChatDetailDialogTestId.Root)).toBeInTheDocument();
      expect(screen.getByTestId(EntityHeroTestId.Name)).toHaveTextContent("Builder");

      // Nothing is injected into the composer.
      expect(screen.queryByTestId("command-line-target-chip")).not.toBeInTheDocument();
      expect(screen.getByTestId(CommandLineTestId.Input)).toHaveValue("");
    });
  });
});
