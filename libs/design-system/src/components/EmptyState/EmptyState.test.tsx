import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState, EmptyStateTestId } from "./EmptyState";

describe("EmptyState", () => {
  it("renders the title", () => {
    render(<EmptyState title="No tasks match these filters." />);
    expect(screen.getByTestId(EmptyStateTestId.Title)).toHaveTextContent(
      "No tasks match these filters.",
    );
  });

  it("renders the body only when provided", () => {
    const { rerender } = render(<EmptyState title="Empty" />);
    expect(screen.queryByTestId(EmptyStateTestId.Body)).not.toBeInTheDocument();
    rerender(<EmptyState body="Try a different source." title="Empty" />);
    expect(screen.getByTestId(EmptyStateTestId.Body)).toHaveTextContent("Try a different source.");
  });

  it("renders the action slot only when provided", () => {
    render(<EmptyState action={<button type="button">New task</button>} title="Empty" />);
    expect(screen.getByTestId(EmptyStateTestId.Action)).toHaveTextContent("New task");
  });

  it("forwards a ref to the root", () => {
    let node: HTMLElement | null = null;
    render(
      <EmptyState
        ref={(el) => {
          node = el;
        }}
        title="Empty"
      />,
    );
    expect(node).toBeInstanceOf(HTMLDivElement);
  });
});
