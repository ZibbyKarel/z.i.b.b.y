import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LivingGlow, LivingGlowTestId } from "./LivingGlow";

describe("LivingGlow", () => {
  it("tints the glow from the canonical tone var", () => {
    render(<LivingGlow tone="run" />);
    const root = screen.getByTestId(LivingGlowTestId.Root);
    expect(root).toHaveAttribute("data-tone", "run");
    expect(root.style.getPropertyValue("--living-color")).toBe("var(--color-run)");
  });

  it("defaults to the ambient idle intensity", () => {
    render(<LivingGlow tone="accent" />);
    const root = screen.getByTestId(LivingGlowTestId.Root);
    expect(root).toHaveAttribute("data-intensity", "idle");
    expect(root.className).toContain("v-glow-idle");
  });

  it("switches to the energized hot keyframe", () => {
    render(<LivingGlow intensity="hot" tone="bad" />);
    const root = screen.getByTestId(LivingGlowTestId.Root);
    expect(root).toHaveAttribute("data-intensity", "hot");
    expect(root.className).toContain("v-glow-hot");
  });

  it("is decorative and honours reduced motion", () => {
    render(<LivingGlow />);
    const root = screen.getByTestId(LivingGlowTestId.Root);
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root.className).toContain("motion-reduce:animate-none");
  });

  it("adds the breath layer only when asked", () => {
    const { rerender } = render(<LivingGlow />);
    expect(screen.getByTestId(LivingGlowTestId.Root).querySelector("span")).toBeNull();
    rerender(<LivingGlow breathe />);
    expect(screen.getByTestId(LivingGlowTestId.Root).querySelector("span")).not.toBeNull();
  });
});
