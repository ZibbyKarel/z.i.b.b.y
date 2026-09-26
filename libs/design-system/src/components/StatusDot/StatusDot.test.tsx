import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusDot, StatusDotTestId } from "./StatusDot";

describe("StatusDot", () => {
  it("renders a sized dot", () => {
    render(<StatusDot size="150" tone="accent" />);
    expect(screen.getByTestId(StatusDotTestId.Root).style.width).toBe("12px");
  });

  it("breathes and glows when live — working", () => {
    render(<StatusDot pulse tone="run" />);
    expect(screen.getByTestId(StatusDotTestId.Dot).className).toContain("animate-zb-live");
  });

  it("blinks when live — blocked", () => {
    render(<StatusDot pulse tone="warn" />);
    expect(screen.getByTestId(StatusDotTestId.Dot).className).toContain("animate-zb-pulse");
  });

  it("stays static even when live — every other tone", () => {
    render(<StatusDot pulse tone="ok" />);
    const dot = screen.getByTestId(StatusDotTestId.Dot);
    expect(dot.className).not.toContain("animate-zb-live");
    expect(dot.className).not.toContain("animate-zb-pulse");
    expect(dot.className).not.toContain("shadow");
  });

  it("stays matte by default — no pulse, no glow", () => {
    render(<StatusDot tone="ok" />);
    const dot = screen.getByTestId(StatusDotTestId.Dot);
    expect(dot.className).not.toContain("animate-zb-live");
    expect(dot.className).not.toContain("shadow");
  });
});
