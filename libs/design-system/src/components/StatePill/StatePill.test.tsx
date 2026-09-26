import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatePill, StatePillTestId } from "./StatePill";

describe("StatePill", () => {
  it("defaults the label to the canonical English state name", () => {
    render(<StatePill state="working" />);
    expect(screen.getByTestId(StatePillTestId.Label)).toHaveTextContent("Working");
  });

  it("overrides the label", () => {
    render(<StatePill label="Migrating billing service" state="working" />);
    expect(screen.getByTestId(StatePillTestId.Label)).toHaveTextContent(
      "Migrating billing service",
    );
  });

  it("tints the dot and label from the same state colour", () => {
    render(<StatePill state="error" />);
    const dot = screen.getByTestId(StatePillTestId.Dot);
    const label = screen.getByTestId(StatePillTestId.Label);
    expect(dot.style.background).toBe("var(--color-state-err)");
    expect(label.style.color).toBe("var(--color-state-err)");
  });

  it("breathes the dot only when working, blinks only when blocked", () => {
    const { rerender } = render(<StatePill state="working" />);
    expect(screen.getByTestId(StatePillTestId.Dot).style.animation).toContain("zb-live");

    rerender(<StatePill state="blocked" />);
    expect(screen.getByTestId(StatePillTestId.Dot).style.animation).toContain("zb-pulse");

    rerender(<StatePill state="done" />);
    expect(screen.getByTestId(StatePillTestId.Dot).style.animation).toBe("none");
  });

  it("renders a square dot (DS.md §7 — no rounded status dot)", () => {
    render(<StatePill state="idle" />);
    const dot = screen.getByTestId(StatePillTestId.Dot);
    expect(dot.style.borderRadius).toBe("var(--dot-r, 0px)");
    expect(dot.style.width).toBe("8px");
    expect(dot.style.height).toBe("8px");
  });

  it("is decorative on the dot, keeping the accessible name on the label", () => {
    render(<StatePill state="done" />);
    expect(screen.getByTestId(StatePillTestId.Dot)).toHaveAttribute("aria-hidden", "true");
  });

  it("forwards a ref and arbitrary props to the root", () => {
    let node: HTMLElement | null = null;
    render(
      <StatePill
        aria-label="agent state"
        ref={(el) => {
          node = el;
        }}
        state="idle"
      />,
    );
    expect(node).toBeInstanceOf(HTMLSpanElement);
    expect(screen.getByTestId(StatePillTestId.Root)).toHaveAttribute("aria-label", "agent state");
  });
});
