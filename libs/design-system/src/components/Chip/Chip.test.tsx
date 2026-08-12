import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
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

  it("shows no close button by default", () => {
    render(<Chip>plain</Chip>);
    expect(screen.queryByTestId(ChipTestId.Close)).not.toBeInTheDocument();
  });

  it("renders a close button with an accessible name and fires onClose", async () => {
    const onClose = vi.fn();
    render(
      <Chip closable closeLabel="Remove reply" onClose={onClose}>
        reply
      </Chip>,
    );
    const close = screen.getByTestId(ChipTestId.Close);
    expect(close).toHaveRole("button");
    expect(close).toHaveAccessibleName("Remove reply");
    await userEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
