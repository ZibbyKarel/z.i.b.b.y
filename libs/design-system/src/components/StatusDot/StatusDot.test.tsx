import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusDot, StatusDotTestId } from "./StatusDot";

describe("StatusDot", () => {
  it("renders a sized dot", () => {
    render(<StatusDot size="150" tone="accent" />);
    expect(screen.getByTestId(StatusDotTestId.Root).style.width).toBe("12px");
  });

  it("pulses and glows when live", () => {
    render(<StatusDot pulse tone="run" />);
    expect(screen.getByTestId(StatusDotTestId.Dot).className).toContain("animate-live");
  });

  it("stays matte by default — no pulse, no glow", () => {
    render(<StatusDot tone="ok" />);
    const dot = screen.getByTestId(StatusDotTestId.Dot);
    expect(dot.className).not.toContain("animate-live");
    expect(dot.className).not.toContain("shadow");
  });
});
