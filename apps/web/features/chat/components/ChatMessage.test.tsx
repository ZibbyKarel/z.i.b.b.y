import { describe, expect, it } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { ChatMessage, ChatMessageTestId } from "./ChatMessage";

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
