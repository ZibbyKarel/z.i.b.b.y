import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScreenGlow, ScreenGlowTestId } from "./ScreenGlow";

describe("ScreenGlow", () => {
  it("is a decorative, non-interactive viewport overlay", () => {
    render(<ScreenGlow />);
    const root = screen.getByTestId(ScreenGlowTestId.Root);
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root.className).toContain("pointer-events-none");
    expect(root.className).toContain("fixed");
    expect(root.className).toContain("inset-0");
  });

  it("draws the glowing edge ring inside the overlay", () => {
    render(<ScreenGlow />);
    expect(screen.getByTestId(ScreenGlowTestId.Ring).className).toContain("zb-screen-glow");
  });
});
