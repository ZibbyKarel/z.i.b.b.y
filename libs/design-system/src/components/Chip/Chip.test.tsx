import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
    render(<Chip ref={(el) => { node = el; }}>ref</Chip>);
    expect(node).toBeInstanceOf(HTMLSpanElement);
  });

  it("applies a solid tone variant", () => {
    render(<Chip solid tone="accent">work</Chip>);
    expect(screen.getByTestId(ChipTestId.Root)).toHaveClass("text-accent-contrast");
  });

  it("sets transparent border for all solid tones", () => {
    render(<Chip solid tone="ok">ok</Chip>);
    expect(screen.getByTestId(ChipTestId.Root)).toHaveClass("border-transparent");
  });

  it("renders the run tone", () => {
    render(<Chip tone="run">běží</Chip>);
    expect(screen.getByTestId(ChipTestId.Root)).toHaveClass("text-work");
  });
});
