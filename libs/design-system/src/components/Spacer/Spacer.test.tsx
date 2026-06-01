import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Spacer } from "./Spacer";

describe("Spacer", () => {
  it("renders an aria-hidden span", () => {
    const { container } = render(<Spacer />);
    const span = container.querySelector("span")!;
    expect(span).toHaveAttribute("aria-hidden");
  });

  it("grows to fill when grow=true", () => {
    const { container } = render(<Spacer grow />);
    expect((container.firstChild as HTMLElement).style.flexGrow).toBe("1");
  });

  it("applies spacing size to both axes", () => {
    const { container } = render(<Spacer size="200" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe("16px");
    expect(el.style.height).toBe("16px");
  });

  it("axis=x only sets width", () => {
    const { container } = render(<Spacer size="100" axis="x" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe("8px");
    expect(el.style.height).toBe("");
  });

  it("axis=y only sets height", () => {
    const { container } = render(<Spacer size="100" axis="y" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.height).toBe("8px");
    expect(el.style.width).toBe("");
  });
});
