import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FloatingPanel, FloatingPanelTestId } from "./FloatingPanel";

describe("FloatingPanel", () => {
  it("renders its children unchanged", () => {
    render(
      <FloatingPanel>
        <span data-testid="child">hi</span>
      </FloatingPanel>,
    );
    expect(screen.getByTestId("child")).toHaveTextContent("hi");
  });

  it("applies the float animation and honours reduced motion, defaulting to index 0", () => {
    render(
      <FloatingPanel>
        <span />
      </FloatingPanel>,
    );
    const root = screen.getByTestId(FloatingPanelTestId.Root);
    expect(root.className).toContain("animate-zt-float");
    expect(root.className).toContain("motion-reduce:animate-none");
    expect(root.style.animationDuration).toBe("6s");
    expect(root.style.animationDelay).toBe("0s");
  });

  it("staggers duration/delay by the given index", () => {
    render(
      <FloatingPanel index={5}>
        <span />
      </FloatingPanel>,
    );
    const root = screen.getByTestId(FloatingPanelTestId.Root);
    expect(root.style.animationDuration).toBe("6.7s");
    expect(root.style.animationDelay).toBe("-6.5s");
  });
});
