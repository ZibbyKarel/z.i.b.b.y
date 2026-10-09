import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { ChatBubble, ChatBubbleTestId } from "./ChatBubble";

describe("ChatBubble", () => {
  it("renders a right-aligned inverted bubble for you", () => {
    render(<ChatBubble author="you">Hi</ChatBubble>);
    const root = screen.getByTestId(ChatBubbleTestId.Root);
    expect(root).toHaveClass("self-end", "bg-ink");
    expect(screen.getByTestId(ChatBubbleTestId.Body)).toHaveTextContent("Hi");
    expect(screen.queryByTestId(ChatBubbleTestId.Actions)).toBeNull();
  });

  it("renders a left-aligned outlined bubble for coo with actions", () => {
    render(
      <ChatBubble actions={<button type="button">Go</button>} author="coo">
        Hello
      </ChatBubble>,
    );
    expect(screen.getByTestId(ChatBubbleTestId.Root)).toHaveClass("self-start", "border-line-2");
    expect(screen.getByTestId(ChatBubbleTestId.Actions)).toHaveTextContent("Go");
  });

  it("accepts a data-testid override and a ref", () => {
    let node: HTMLDivElement | null = null;
    render(
      <ChatBubble
        author="you"
        data-testid="custom"
        ref={(el) => {
          node = el;
        }}
      >
        x
      </ChatBubble>,
    );
    expect(screen.getByTestId("custom")).toBe(node);
  });
});
