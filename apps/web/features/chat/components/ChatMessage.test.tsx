import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "../../../test/render";
import { ChatMessage, ChatMessageTestId } from "./ChatMessage";
import { TargetIdentityTestId } from "./TargetIdentity";
import { ChatRunCardTestId } from "./ChatRunCard";

// A tool event carrying `runRef` upgrades the flat row into `ChatRunCard` (Fáze
// 14.3) — that card is unit-tested on its own; here it's enough to stub its data
// source and assert ChatMessage picked the card over the flat row.
const { pipelineRunMock } = vi.hoisted(() => ({
  pipelineRunMock: vi.fn(() => ({ data: undefined as unknown })),
}));
vi.mock("../../pipelines", () => ({ usePipelineRunQuery: pipelineRunMock }));

// The read-aloud button (Phase 120) is exercised at the mutation/player-hook
// boundary — mirrors `SubsystemDrawer.test.tsx`'s pattern of mocking a
// `mutations/use*Mutation` (and here, the sibling player hook) module rather
// than the ts-rest client underneath it.
const { synthesizeMock, audioPlaybackMock } = vi.hoisted(() => ({
  synthesizeMock: vi.fn(),
  audioPlaybackMock: vi.fn(),
}));
vi.mock("../mutations/useSynthesizeSpeechMutation", () => ({
  useSynthesizeSpeechMutation: synthesizeMock,
}));
vi.mock("../hooks/useAudioPlayback", () => ({
  useAudioPlayback: audioPlaybackMock,
}));

// The `/settings` voice pick (Phase 119c) — every read-aloud mount reads it too,
// so it's stubbed the same way as the two hooks above. Default `undefined` (no
// config loaded yet / `ttsVoice: null`) so the existing "no voice" assertions
// keep holding without every test having to opt in.
let systemConfigResult: { data?: { ttsVoice: string | null } } = { data: undefined };
vi.mock("../../system", () => ({ useSystemConfigQuery: () => systemConfigResult }));

describe("ChatMessage", () => {
  beforeEach(() => {
    // Idle defaults — every test that renders an assistant, non-streaming
    // message with text mounts `ReadAloudButton`, which calls both hooks
    // whether or not the test is actually about read-aloud.
    synthesizeMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    audioPlaybackMock.mockReturnValue({ isPlaying: false, play: vi.fn(), stop: vi.fn() });
    systemConfigResult = { data: undefined };
  });

  it("renders a user turn in the user bubble", () => {
    renderWithProviders(<ChatMessage role="user" text="Ahoj ZIBBY" />);
    expect(screen.getByTestId(ChatMessageTestId.UserBubble)).toBeInTheDocument();
    expect(screen.getByTestId(ChatMessageTestId.Text)).toHaveTextContent("Ahoj ZIBBY");
  });

  it("renders an assistant turn in the assistant bubble", () => {
    renderWithProviders(<ChatMessage role="assistant" text="Ahoj!" />);
    expect(screen.getByTestId(ChatMessageTestId.AssistantBubble)).toBeInTheDocument();
  });

  it("distinguishes assistant vs user turns by background tone, with no repeated author header (Phase 33)", () => {
    renderWithProviders(<ChatMessage role="assistant" text="Ahoj!" />);
    expect(screen.getByTestId(ChatMessageTestId.AssistantBubble).className).toContain(
      "bg-accent-dim",
    );
    // The old per-message "ZIBBY" name + bowler-hat header is gone — role now
    // reads from the bubble's background alone.
    expect(screen.queryByText("ZIBBY")).not.toBeInTheDocument();

    renderWithProviders(<ChatMessage role="user" text="Ahoj" />);
    expect(screen.getByTestId(ChatMessageTestId.UserBubble).className).toContain("bg-raised");
  });

  it("shows the streaming cursor only while streaming", () => {
    const { rerender } = renderWithProviders(<ChatMessage streaming role="assistant" text="…" />);
    expect(screen.getByTestId(ChatMessageTestId.StreamingCursor)).toBeInTheDocument();
    rerender(<ChatMessage role="assistant" text="done" />);
    expect(screen.queryByTestId(ChatMessageTestId.StreamingCursor)).not.toBeInTheDocument();
  });

  it("renders a tool dispatch announcement as a link to its href", () => {
    renderWithProviders(
      <ChatMessage
        role="assistant"
        text="Hotovo."
        toolEvents={[
          { name: "create_task", status: "ok", summary: "Spustil jsem úkol.", href: "/runs" },
        ]}
      />,
    );
    const link = screen.getByTestId(ChatMessageTestId.ToolEventLink);
    expect(link).toHaveAttribute("href", "/runs");
    expect(screen.getByTestId(ChatMessageTestId.ToolEvent)).toHaveTextContent("Spustil jsem úkol.");
  });

  it("upgrades a tool event with a known runRef into the live ChatRunCard (Fáze 14.3)", () => {
    pipelineRunMock.mockReturnValue({
      data: {
        runId: "delivery_1",
        kind: "pipeline",
        owner: "delivery",
        status: "running",
        pct: null,
        title: "",
        prompt: "",
        project: "",
        startedAt: new Date().toISOString(),
        logBase: null,
      },
    });
    renderWithProviders(
      <ChatMessage
        role="assistant"
        text="Hotovo."
        toolEvents={[
          {
            name: "create_task",
            status: "ok",
            summary: "Spustil jsem úkol — pipeline Delivery.",
            href: "/runs?run=delivery_1",
            target: { kind: "pipeline", id: "delivery", name: "Delivery", glyph: "flow" },
            runRef: "delivery_1",
            taskId: "task-9",
          },
        ]}
      />,
    );
    // The flat row is gone — the card replaces it entirely (not a sibling).
    expect(screen.queryByTestId(ChatMessageTestId.ToolEvent)).not.toBeInTheDocument();
    expect(screen.getByTestId(ChatRunCardTestId.Root)).toHaveTextContent("Delivery");
    expect(screen.getByTestId(ChatRunCardTestId.Link)).toHaveAttribute(
      "href",
      "/runs?run=delivery_1",
    );
  });

  it("keeps the flat row for a tool event without a runRef, even with a target", () => {
    renderWithProviders(
      <ChatMessage
        role="assistant"
        text="Hotovo."
        toolEvents={[
          {
            name: "create_task",
            status: "started",
            summary: "Spouštím pipeline Delivery.",
            target: { kind: "pipeline", id: "delivery", name: "Delivery", glyph: "flow" },
          },
        ]}
      />,
    );
    expect(screen.getByTestId(TargetIdentityTestId.Root)).toHaveTextContent("Delivery");
    expect(screen.queryByTestId(ChatRunCardTestId.Root)).not.toBeInTheDocument();
  });

  it("renders the orchestrator's own identity when the target is the orchestrator fallback", () => {
    renderWithProviders(
      <ChatMessage
        role="assistant"
        text="Hotovo."
        toolEvents={[
          {
            name: "create_task",
            status: "ok",
            target: { kind: "orchestrator", name: "Orchestrator", glyph: "compass" },
          },
        ]}
      />,
    );
    expect(screen.getByTestId(TargetIdentityTestId.Root)).toHaveTextContent("Orchestrator");
  });

  it("renders a tool event without an href as plain text (no link)", () => {
    renderWithProviders(
      <ChatMessage
        role="assistant"
        text="Pracuji…"
        toolEvents={[{ name: "search", status: "started" }]}
      />,
    );
    expect(screen.queryByTestId(ChatMessageTestId.ToolEventLink)).not.toBeInTheDocument();
    expect(screen.getByTestId(ChatMessageTestId.ToolEvent)).toHaveTextContent("search");
  });

  describe("read aloud (Phase 120)", () => {
    it("shows the button on a completed assistant message", () => {
      renderWithProviders(<ChatMessage role="assistant" text="Hotovo." />);
      expect(screen.getByTestId(ChatMessageTestId.ReadAloudButton)).toBeInTheDocument();
    });

    it("hides the button on a user turn", () => {
      renderWithProviders(<ChatMessage role="user" text="Ahoj" />);
      expect(screen.queryByTestId(ChatMessageTestId.ReadAloudButton)).not.toBeInTheDocument();
    });

    it("hides the button on the still-streaming assistant bubble", () => {
      renderWithProviders(<ChatMessage streaming role="assistant" text="Pí…" />);
      expect(screen.queryByTestId(ChatMessageTestId.ReadAloudButton)).not.toBeInTheDocument();
    });

    it("hides the button on an empty assistant turn (pure tool dispatch, no text)", () => {
      renderWithProviders(
        <ChatMessage
          role="assistant"
          text=""
          toolEvents={[{ name: "search", status: "started" }]}
        />,
      );
      expect(screen.queryByTestId(ChatMessageTestId.ReadAloudButton)).not.toBeInTheDocument();
    });

    it("synthesizes the message text on click and plays the result on success", async () => {
      const mutate = vi.fn((_vars, opts?: { onSuccess?: (r: { body: { audioBase64: string } } ) => void }) => {
        opts?.onSuccess?.({ body: { audioBase64: "d2F2ZQ==" } });
      });
      const play = vi.fn();
      synthesizeMock.mockReturnValue({ mutate, isPending: false });
      audioPlaybackMock.mockReturnValue({ isPlaying: false, play, stop: vi.fn() });

      renderWithProviders(<ChatMessage role="assistant" text="Ahoj světe" />);
      await userEvent.click(screen.getByTestId(ChatMessageTestId.ReadAloudButton));

      expect(mutate).toHaveBeenCalledWith(
        { body: { text: "Ahoj světe" } },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
      expect(play).toHaveBeenCalledWith("d2F2ZQ==");
    });

    it("includes the configured /settings voice (Phase 119c) in the synthesize body", async () => {
      const mutate = vi.fn();
      synthesizeMock.mockReturnValue({ mutate, isPending: false });
      systemConfigResult = { data: { ttsVoice: "cs-jarvis" } };

      renderWithProviders(<ChatMessage role="assistant" text="Ahoj světe" />);
      await userEvent.click(screen.getByTestId(ChatMessageTestId.ReadAloudButton));

      expect(mutate).toHaveBeenCalledWith(
        { body: { text: "Ahoj světe", voice: "cs-jarvis" } },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it("shows a loading state while synthesizing", () => {
      synthesizeMock.mockReturnValue({ mutate: vi.fn(), isPending: true });
      renderWithProviders(<ChatMessage role="assistant" text="Ahoj" />);
      expect(screen.getByTestId(ChatMessageTestId.ReadAloudButton)).toHaveAttribute(
        "aria-busy",
        "true",
      );
    });

    it("stops playback (without re-synthesizing) when clicked while playing", async () => {
      const mutate = vi.fn();
      const stop = vi.fn();
      synthesizeMock.mockReturnValue({ mutate, isPending: false });
      audioPlaybackMock.mockReturnValue({ isPlaying: true, play: vi.fn(), stop });

      renderWithProviders(<ChatMessage role="assistant" text="Ahoj" />);
      await userEvent.click(screen.getByTestId(ChatMessageTestId.ReadAloudButton));

      expect(stop).toHaveBeenCalledTimes(1);
      expect(mutate).not.toHaveBeenCalled();
    });
  });
});
