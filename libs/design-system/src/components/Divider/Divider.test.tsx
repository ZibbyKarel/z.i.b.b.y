import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DesignSystemProvider } from "../../DesignSystemContext/DesignSystemProvider";
import { Divider } from "./Divider";

function wrap(ui: React.ReactNode) {
  return render(<DesignSystemProvider theme="dark">{ui}</DesignSystemProvider>);
}

describe("Divider", () => {
  it("renders a separator element", () => {
    const { container } = wrap(<Divider />);
    expect(container.querySelector('[role="separator"]')).not.toBeNull();
  });

  it("is aria-hidden", () => {
    const { container } = wrap(<Divider />);
    const sep = container.querySelector('[role="separator"]')!;
    expect(sep).toHaveAttribute("aria-hidden");
  });

  it("horizontal variant spans full width at 1px height", () => {
    const { container } = wrap(<Divider orientation="horizontal" />);
    const sep = container.querySelector('[role="separator"]') as HTMLElement;
    expect(sep.style.width).toBe("100%");
    expect(sep.style.height).toBe("1px");
  });

  it("vertical variant is 1px wide", () => {
    const { container } = wrap(<Divider orientation="vertical" />);
    const sep = container.querySelector('[role="separator"]') as HTMLElement;
    expect(sep.style.width).toBe("1px");
  });
});
