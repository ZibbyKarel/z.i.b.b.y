import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { ChatMessage, ChatMessageTestId } from "./ChatMessage";
import { ChatRunCardTestId } from "./ChatRunCard";

// A tool event carrying `runRef` upgrades the flat row into `ChatRunCard` (Fáze
// 14.3) — that card is unit-tested on its own; here it's enough to stub its data
// source and assert ChatMessage picked the card over the flat row.
const { pipelineRunMock } = vi.hoisted(() => ({
  pipelineRunMock: vi.fn(() => ({ data: undefined as unknown })),
}));
vi.mock("../../pipelines", () => ({ usePipelineRunQuery: pipelineRunMock }));

describe("ChatMessage", () => {
  it("renders a user turn in the user bubble", () => {
    renderWithProviders(<ChatMessage role="user" text="Ahoj ZIBBY" />);
    expect(screen.getByTestId(ChatMessageTestId.UserBubble)).toBeInTheDocument();
    expect(screen.getByTestId(ChatMessageTestId.Text)).toHaveTextContent("Ahoj ZIBBY");
  });

  it("renders an assistant turn in the assistant bubble", () => {
    renderWithProviders(<ChatMessage role="assistant" text="Ahoj!" />);
    expect(screen.getByTestId(ChatMessageTestId.AssistantBubble)).toBeInTheDocument();
  });

  it("shows the ZIBBY identity on assistant turns but not on the operator's own turn", () => {
    const { rerender } = renderWithProviders(<ChatMessage role="assistant" text="Ahoj!" />);
    expect(screen.getByTestId(ChatMessageTestId.AssistantIdentity)).toHaveTextContent("ZIBBY");

    rerender(<ChatMessage role="user" text="Ahoj" />);
    expect(screen.queryByTestId(ChatMessageTestId.AssistantIdentity)).not.toBeInTheDocument();
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
    expect(screen.getByTestId(ChatMessageTestId.ToolEventTarget)).toHaveTextContent("Delivery");
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
    expect(screen.getByTestId(ChatMessageTestId.ToolEventTarget)).toHaveTextContent("Orchestrator");
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
});
