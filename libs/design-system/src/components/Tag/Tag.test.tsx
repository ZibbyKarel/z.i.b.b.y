import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tag, TagTestId } from "./Tag";

describe("Tag", () => {
  it("renders its content", () => {
    render(<Tag tone="ok">hotovo</Tag>);
    expect(screen.getByTestId(TagTestId.Root)).toHaveTextContent("hotovo");
  });

  it("renders as a span", () => {
    render(<Tag>test</Tag>);
    expect(screen.getByTestId(TagTestId.Root).tagName).toBe("SPAN");
  });

  it("forwards a ref", () => {
    let node: HTMLSpanElement | null = null;
    render(
      <Tag
        ref={(el) => {
          node = el;
        }}
      >
        ref
      </Tag>,
    );
    expect(node).toBeInstanceOf(HTMLSpanElement);
  });

  it("renders the run tone", () => {
    render(<Tag tone="run">běží</Tag>);
    expect(screen.getByTestId(TagTestId.Root)).toHaveClass("text-run");
  });

  it("applies a solid tone variant", () => {
    render(
      <Tag solid tone="accent">
        work
      </Tag>,
    );
    const root = screen.getByTestId(TagTestId.Root);
    expect(root).toHaveClass("text-accent-contrast");
    expect(root).toHaveClass("border-transparent");
  });

  it("renders a risk tone palette", () => {
    render(<Tag tone="payment">payment</Tag>);
    expect(screen.getByTestId(TagTestId.Root)).toHaveClass("text-risk-payment");
  });

  it("renders a leading icon when provided", () => {
    render(
      <Tag icon="dollar" tone="payment">
        payment
      </Tag>,
    );
    expect(
      within(screen.getByTestId(TagTestId.Root)).getByTestId(TagTestId.Icon),
    ).toBeInTheDocument();
  });

  it("omits the icon when none is given", () => {
    render(<Tag tone="neutral">plain</Tag>);
    expect(screen.queryByTestId(TagTestId.Icon)).not.toBeInTheDocument();
  });
});
