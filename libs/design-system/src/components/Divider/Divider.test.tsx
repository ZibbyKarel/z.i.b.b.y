import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { Divider } from "./Divider";

describe("Divider", () => {
  it("renders a separator element", () => {
    const { container } = render(<Divider />);
    expect(container.querySelector('[role="separator"]')).not.toBeNull();
  });

  it("is aria-hidden", () => {
    const { container } = render(<Divider />);
    const sep = container.querySelector('[role="separator"]')!;
    expect(sep).toHaveAttribute("aria-hidden");
  });

  it("horizontal variant spans full width at 1px height", () => {
    const { container } = render(<Divider orientation="horizontal" />);
    const sep = container.querySelector('[role="separator"]') as HTMLElement;
    expect(sep.style.width).toBe("100%");
    expect(sep.style.height).toBe("1px");
  });

  it("vertical variant is 1px wide", () => {
    const { container } = render(<Divider orientation="vertical" />);
    const sep = container.querySelector('[role="separator"]') as HTMLElement;
    expect(sep.style.width).toBe("1px");
  });
});
