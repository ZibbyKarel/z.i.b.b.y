import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusDotTestId } from "../StatusDot/StatusDot";
import { Chip, ChipTestId } from "./Chip";

describe("Chip", () => {
  it("renders its content", () => {
    render(<Chip tone="ok">hotovo</Chip>);
    expect(screen.getByTestId(ChipTestId.Root)).toHaveTextContent("hotovo");
  });

  it("renders as a span", () => {
    render(<Chip>test</Chip>);
    expect(screen.getByTestId(ChipTestId.Root).tagName).toBe("SPAN");
  });

  it("forwards a ref", () => {
    let node: HTMLSpanElement | null = null;
    render(
      <Chip
        ref={(el) => {
          node = el;
        }}
      >
        ref
      </Chip>,
    );
    expect(node).toBeInstanceOf(HTMLSpanElement);
  });

  it("renders the run tone", () => {
    render(<Chip tone="run">běží</Chip>);
    expect(screen.getByTestId(ChipTestId.Root)).toHaveClass("text-run");
  });

  it("shows no dot by default", () => {
    render(<Chip tone="ok">hotovo</Chip>);
    expect(screen.queryByTestId(ChipTestId.Dot)).not.toBeInTheDocument();
  });

  it("shows a leading dot and pulses it only when live", () => {
    const { rerender } = render(
      <Chip dot pulse tone="run">
        běží
      </Chip>,
    );
    const root = screen.getByTestId(ChipTestId.Root);
    expect(within(root).getByTestId(ChipTestId.Dot)).toBeInTheDocument();
    expect(within(root).getByTestId(StatusDotTestId.Dot).className).toContain("animate-live");

    rerender(
      <Chip dot tone="ok">
        hotovo
      </Chip>,
    );
    expect(
      within(screen.getByTestId(ChipTestId.Root)).getByTestId(StatusDotTestId.Dot).className,
    ).not.toContain("animate-live");
  });
});
