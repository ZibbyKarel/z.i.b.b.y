import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "../../../test/render";
import { installEventSourceMock } from "../../../test/eventSourceMock";
import {
  installMockSpeechRecognition,
  latestRecognition,
  uninstallSpeechRecognition,
} from "../../../test/speechRecognitionMock";

// The stream hook reads API_URL off the env; pin it so the EventSource opens. Keep
// the REAL `apiClient` (via importOriginal) — the mention picker's agent/pipeline
// queries are stubbed at their own hook level below, but other modules pulled in
// transitively through the agents/pipelines barrels (e.g. mutation hooks) still
// reference `apiClient` at import time and would break on a bare `{ API_URL }` mock.
// Voice-mode turn-taking (Phase 119d) drives the auto-speak orchestrator, which
// synthesizes over `apiClient.speech.synthesize` and plays through
// `useAudioPlayback`. Capture both at the module boundary (via `vi.hoisted`, so
// the factories can close over them) — the full-loop test resolves synth and
// fires the captured `onSettled` to walk the state machine deterministically,
// with no real fetch or `<Audio>`.
const { synthesizeMutate, playCalls, stopAudioSpy, anyAudioStore } = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    synthesizeMutate: vi.fn(),
    playCalls: [] as Array<{
      key: string;
      onSettled?: (reason: "ended" | "error" | "stopped" | "superseded") => void;
    }>,
    stopAudioSpy: vi.fn(),
    /** Drives the mocked `useAnyAudioPlaying` — the echo-hazard tests flip it to
     * simulate a MANUAL read-aloud playback starting/ending (the real store lives
     * in the mocked-away `useAudioPlayback` module). */
    anyAudioStore: {
      playing: false,
      set(value: boolean) {
        this.playing = value;
        for (const listener of listeners) listener();
      },
      subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
  };
});
vi.mock("../../../state/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../state/api")>();
  return {
    ...actual,
    API_URL: "http://localhost:3333",
    apiClient: {
      ...actual.apiClient,
      speech: {
        ...actual.apiClient.speech,
        synthesize: { ...actual.apiClient.speech.synthesize, mutate: synthesizeMutate },
      },
    },
  };
});
// The player is a module-level singleton wrapping a real `<Audio>` element (no-op
// in jsdom). Mock it so the auto-speak queue is fully controllable and no other
// suite behaviour changes (nothing here clicks a read-aloud button).
// `useAnyAudioPlaying` is a real subscription over the hoisted `anyAudioStore`
// above, so a test flipping it re-renders `ChatScreen` exactly as the real
// `useSyncExternalStore` would on a manual read-aloud starting/ending.
vi.mock("../hooks/useAudioPlayback", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    playAudioPlayback: (
      key: string,
      _audioBase64: string,
      onSettled?: (reason: "ended" | "error" | "stopped" | "superseded") => void,
    ) => {
      playCalls.push({ key, onSettled });
    },
    stopAudioPlayback: stopAudioSpy,
    useAudioPlayback: () => ({ isPlaying: false, play: vi.fn(), stop: vi.fn() }),
    useAnyAudioPlaying: () =>
      useSyncExternalStore(
        (listener: () => void) => anyAudioStore.subscribe(listener),
        () => anyAudioStore.playing,
        () => false,
      ),
  };
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
// CommandLine (child, Phase 38 — the chat composer in send-delegation mode)
// reads the agent/pipeline catalogs for its @mention picker (Fáze 14.2); the ⌘K
// palette (Fáze 14.5) reads the same two plus gates/memory — stub every one
// (with one fixture each, reused by the 14.5 wiring tests below) so this suite
// never hits the network.
vi.mock("../../agents/queries/useAgentsQuery", () => ({
  useAgentsQuery: () => ({ data: [{ id: "builder", name: "Builder", glyph: "hammer" }] }),
  getAgentsQueryKey: () => ["agents"],
}));
vi.mock("../../pipelines/queries/usePipelinesQuery", () => ({
  usePipelinesQuery: () => ({ data: [] }),
  getPipelinesQueryKey: () => ["pipelines"],
}));
// The Phase 83 subsystem web strip polls the subsystem-federation registry — stub it
// with a couple of fixtures (one klid, one bezi) so the suite never hits the network
// and the strip has something concrete to assert against.
vi.mock("../../subsystems/queries/useSubsystemsQuery", () => ({
  useSubsystemsQuery: () => ({
    data: [
      {
        id: "forge",
        name: "Forge",
        tagline: "Kovárna doručení",
        mandate: "…",
        color: "#f97316",
        heroImage: null,
        state: "klid",
        tier2Count: 0,
        tier3Count: 0,
      },
      {
        id: "puls",
        name: "Puls",
        tagline: "Tep systému",
        mandate: "…",
        color: "#14b8a6",
        heroImage: null,
        state: "bezi",
        tier2Count: 0,
        tier3Count: 0,
      },
    ],
  }),
  getSubsystemsQueryKey: () => ["subsystems"],
}));
// CommandLine also reads the limits query (for its schedule menu, unused in
// send-delegation mode) and the attachment-upload mutation (unused —
// `showAttach={false}` in chat) — stub both so mounting it never hits the
// network, matching `CommandLine.test.tsx`'s own mocking pattern.
vi.mock("../../limits/queries/useLimitsQuery", () => ({
  useLimitsQuery: () => ({
    data: { rolling: { usedPct: 10, resetsAt: null }, weekly: { usedPct: 5, resetsAt: null }, capturedAt: Date.now(), stale: false },
  }),
}));
vi.mock("../../tasks/mutations/useUploadTaskAttachmentsMutation", () => ({
  useUploadTaskAttachmentsMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
// CommandLine's inline project picker (Phase 102/108 — the only project
// control left, per-task only) reads the project registry — stub it.
vi.mock("../../projects/queries/useProjectsQuery", () => ({
  useProjectsQuery: () => ({ data: [{ id: "alpha", name: "Alpha" }] }),
  getProjectsQueryKey: () => ["projects"],
}));
// The `/settings` voice pick (Phase 119c) — both `ChatScreen` itself and every
// `ChatMessage`'s read-aloud button read it. Mocked at the same module path
// `CosmicScene.test.tsx` uses, so it also covers the real (unmocked) `CosmicScene`
// child this suite renders. `undefined` data = `ttsVoice: null`, matching the
// suite's existing behaviour before this option existed.
vi.mock("../../system", () => ({ useSystemConfigQuery: () => ({ data: undefined }) }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
// `ChatScreen` reads `usePipelineRunQuery` (the same aggregate `ChatRunCard` polls,
// Rozhodnutí 5, Fáze 15.3) to derive the `waiting-approval` orb mode. Mock only that
// one export off the barrel — `CommandLine`/`ChatPalette` also import
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
import { EntityHeroTestId, SearchBarTestId, SearchMenuTestId } from "@zibby/design-system";
import { ChatScreen, ChatScreenTestId } from "./ChatScreen";
import { VoiceToggleButtonTestId } from "./VoiceToggleButton";
import { CommandLineTestId } from "../../tasks/components/CommandLine/CommandLine";
import { CosmicSceneTestId } from "../scene/CosmicScene";
import { SubsystemOrbsOverlayTestId } from "../scene/SubsystemOrbsOverlay";
import { ChatDetailDialogTestId } from "./ChatDetailDialog";
import { ChatPaletteTestId } from "./ChatPalette";

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

    await user.type(screen.getByTestId(CommandLineTestId.Input), "Jak se máš");
    await user.click(screen.getByTestId(CommandLineTestId.Send));

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

  it("has no project control at all — chat is send-delegation only, and the project selector moved to the task-launch container (Phase 118d)", () => {
    renderWithProviders(<ChatScreenHarness />);
    expect(screen.queryByTestId("project-switcher")).not.toBeInTheDocument();
    // The generic `CommandLine` chat composes directly no longer renders a project
    // selector at all — that control is `TaskCommandLine`-only now.
    expect(screen.queryByTestId("task-command-line-project-selector")).not.toBeInTheDocument();
  });

  it("hides New chat on an empty thread and clears the transcript when used", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ChatScreenHarness />);

    // No turns yet → nothing to reset, so the New chat affordance is absent.
    expect(screen.queryByTestId(ChatScreenTestId.NewChat)).not.toBeInTheDocument();

    await user.type(screen.getByTestId(CommandLineTestId.Input), "Ahoj");
    await user.click(screen.getByTestId(CommandLineTestId.Send));
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

      await user.type(screen.getByTestId(CommandLineTestId.Input), "Ahoj");
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

      await user.type(screen.getByTestId(CommandLineTestId.Input), "Jak se máš");
      await user.click(screen.getByTestId(CommandLineTestId.Send));

      act(() => {
        mock.last().emit({ conversationId: "c1", turnId: "t1", type: "delta", text: "Mám se" });
      });

      expect(screen.getByTestId(CosmicSceneTestId.Root)).toHaveAttribute("data-mode", "streaming");
    });

    it("is tool while the last announced tool event is still running", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ChatScreenHarness />);

      await user.type(screen.getByTestId(CommandLineTestId.Input), "Naplánuj úkol");
      await user.click(screen.getByTestId(CommandLineTestId.Send));

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

      await user.type(screen.getByTestId(CommandLineTestId.Input), "Jak se máš");
      await user.click(screen.getByTestId(CommandLineTestId.Send));

      act(() => {
        mock.last().emit({ conversationId: "c1", turnId: "t1", type: "error", message: "boom" });
      });

      expect(screen.getByTestId(CosmicSceneTestId.Root)).toHaveAttribute("data-mode", "error");
    });

    it("is waiting-approval when the last dispatched run is parked on the operator's decision (Fáze 15.3)", async () => {
      pipelineRunMock.mockReturnValue({ data: { status: "awaiting-approval" } });
      const user = userEvent.setup();
      renderWithProviders(<ChatScreenHarness />);

      await user.type(screen.getByTestId(CommandLineTestId.Input), "Naplánuj úkol");
      await user.click(screen.getByTestId(CommandLineTestId.Send));

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

  describe("subsystem mini-orbs overlay (Phase 95, was the SVG web in 83)", () => {
    it("renders the overlay with all mocked subsystems, over the scene", () => {
      renderWithProviders(<ChatScreenHarness />);

      expect(screen.getByTestId(SubsystemOrbsOverlayTestId.Root)).toBeInTheDocument();
      expect(screen.getByTestId(`${SubsystemOrbsOverlayTestId.Node}-forge`)).toBeInTheDocument();
      expect(screen.getByTestId(`${SubsystemOrbsOverlayTestId.Node}-puls`)).toBeInTheDocument();
    });

    it("clicking a node opens the drawer for that subsystem, and moving selection swaps it", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ChatScreenHarness />);

      const forgeNode = screen.getByTestId(`${SubsystemOrbsOverlayTestId.Node}-forge`);
      expect(forgeNode).toHaveAttribute("aria-pressed", "false");

      await user.click(forgeNode);
      expect(screen.getByTestId(`${SubsystemOrbsOverlayTestId.Node}-forge`)).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      // Selecting a different node moves the ring — only one selection at a time.
      await user.click(screen.getByTestId(`${SubsystemOrbsOverlayTestId.Node}-puls`));
      expect(screen.getByTestId(`${SubsystemOrbsOverlayTestId.Node}-puls`)).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByTestId(`${SubsystemOrbsOverlayTestId.Node}-forge`)).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });
  });

  describe("quick-switcher (Fáze 14.5)", () => {
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

      // The old duplicated behaviour is gone: nothing is injected into the composer.
      // The top target chip was retired in Phase 59 and its testid enum member
      // removed in Phase 118d (no live consumer needed it any more) — this literal
      // keeps the "never resolves to a rendered chip" regression assertion intact.
      expect(screen.queryByTestId("command-line-target-chip")).not.toBeInTheDocument();
      expect(screen.getByTestId(CommandLineTestId.Input)).toHaveValue("");
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

  describe("voice-mode turn-taking (Phase 119d)", () => {
    // Drain the microtask queue so a synth promise's `.then` (the play step) runs.
    async function flush() {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    beforeEach(() => {
      installMockSpeechRecognition();
      playCalls.length = 0;
      anyAudioStore.playing = false;
      stopAudioSpy.mockClear();
      synthesizeMutate.mockReset();
      synthesizeMutate.mockImplementation(({ body }: { body: { text: string } }) =>
        Promise.resolve({
          status: 200 as const,
          body: { audioBase64: `wav:${body.text}`, format: "wav", audioMs: null, synthMs: null, voice: null },
        }),
      );
    });
    afterEach(() => {
      uninstallSpeechRecognition();
    });

    /** Toggle voice mode on and return the (now-armed) recognizer. */
    async function armVoice(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByTestId(VoiceToggleButtonTestId.Root));
      const rec = latestRecognition();
      expect(rec.started).toBe(true);
      return rec;
    }

    it("runs the full hands-free loop: listen → send → disarm → speak → re-arm", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ChatScreenHarness />);
      const rec = await armVoice(user);

      // A finalized utterance is sent verbatim, bypassing the composer (Decision 1).
      act(() => rec.emitResult([{ transcript: "jak se máš", isFinal: true }]));
      expect(mutate).toHaveBeenCalledWith({ body: { conversationId: "c1", text: "jak se máš" } });

      // The turn goes in flight (streaming) → the mic disarms.
      act(() => mock.last().emit({ conversationId: "c1", turnId: "t1", type: "delta", text: "Mám" }));
      expect(rec.started).toBe(false);

      // The turn finishes WITH text → the reply is synthesized and played; the mic
      // stays disarmed while speaking.
      act(() => mock.last().emit({ conversationId: "c1", turnId: "t1", type: "done", text: "Mám se dobře." }));
      await flush();
      expect(playCalls.length).toBeGreaterThan(0);
      expect(playCalls[playCalls.length - 1]?.key).toBe("voice-mode");
      expect(rec.started).toBe(false);

      // The auto-speak queue settles naturally ("ended" on the last chunk) → re-arm.
      await act(async () => {
        playCalls[playCalls.length - 1]?.onSettled?.("ended");
        await Promise.resolve();
      });
      expect(rec.started).toBe(true);
    });

    it("does NOT re-arm when a manual read-aloud supersedes the reply (operator took over) — voice mode stays on but paused", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ChatScreenHarness />);
      const rec = await armVoice(user);

      act(() => rec.emitResult([{ transcript: "jak se máš", isFinal: true }]));
      act(() => mock.last().emit({ conversationId: "c1", turnId: "t1", type: "delta", text: "Mám" }));
      act(() => mock.last().emit({ conversationId: "c1", turnId: "t1", type: "done", text: "Mám se dobře." }));
      await flush();
      expect(rec.started).toBe(false);

      // A phase-120 read-aloud click supersedes the voice-mode playback.
      await act(async () => {
        playCalls[playCalls.length - 1]?.onSettled?.("superseded");
        await Promise.resolve();
      });

      // The mic stays off (paused), but voice mode is still ON (the strip shows the
      // paused state; toggling off/on recovers).
      expect(rec.started).toBe(false);
      expect(screen.getByTestId(VoiceToggleButtonTestId.Root)).toHaveAttribute("aria-pressed", "true");
    });

    it("returns to listening when a turn completes with no speakable text (never strands the loop)", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ChatScreenHarness />);
      const rec = await armVoice(user);

      act(() => rec.emitResult([{ transcript: "naplánuj úkol", isFinal: true }]));
      // A pure tool dispatch drives the turn in flight (streaming) with no text.
      act(() =>
        mock.last().emit({
          conversationId: "c1",
          turnId: "t1",
          type: "tool",
          tool: { name: "create_task", status: "started" },
        }),
      );
      expect(rec.started).toBe(false);

      // Done with empty text → nothing to speak → straight back to listening.
      act(() => mock.last().emit({ conversationId: "c1", turnId: "t1", type: "done", text: "" }));
      await flush();
      expect(playCalls).toHaveLength(0);
      expect(rec.started).toBe(true);
    });

    it("suspends the idle-armed mic during a MANUAL read-aloud and re-arms when it ends (echo hazard)", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ChatScreenHarness />);
      const rec = await armVoice(user);

      // A phase-120 read-aloud starts while the conversation is idle and the mic
      // is armed. No voice-reply session exists, so the `speakingReply` gate can't
      // help — without the any-playing gate the live mic would transcribe the TTS
      // audio off the speakers and auto-send it (the self-talk loop).
      act(() => anyAudioStore.set(true));
      expect(rec.started).toBe(false);
      // Voice mode itself stays on — this is a transient suspension, not a pause.
      expect(screen.getByTestId(VoiceToggleButtonTestId.Root)).toHaveAttribute("aria-pressed", "true");

      // The manual playback ends → the store notifies → the mic re-arms by itself
      // (no latch: no voice-reply session was interrupted).
      act(() => anyAudioStore.set(false));
      expect(rec.started).toBe(true);
    });

    it("stops everything when voice mode is toggled off mid-loop", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ChatScreenHarness />);
      const rec = await armVoice(user);

      act(() => rec.emitResult([{ transcript: "jak se máš", isFinal: true }]));
      act(() => mock.last().emit({ conversationId: "c1", turnId: "t1", type: "delta", text: "Mám" }));
      act(() => mock.last().emit({ conversationId: "c1", turnId: "t1", type: "done", text: "Mám se dobře." }));
      await flush();

      // Toggle voice mode OFF while the reply is speaking → mic off, playback stopped.
      await user.click(screen.getByTestId(VoiceToggleButtonTestId.Root));
      expect(rec.started).toBe(false);
      expect(stopAudioSpy).toHaveBeenCalled();
      expect(screen.getByTestId(VoiceToggleButtonTestId.Root)).toHaveAttribute("aria-pressed", "false");
    });
  });
});
