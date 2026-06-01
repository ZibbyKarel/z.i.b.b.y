import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Spacer, SpacerTestId } from "./Spacer";

describe("Spacer", () => {
  it("renders an aria-hidden span", () => {
    render(<Spacer />);
    expect(screen.getByTestId(SpacerTestId.Root)).toHaveAttribute("aria-hidden");
  });

  it("grows to fill when grow=true", () => {
    render(<Spacer grow />);
    expect(screen.getByTestId(SpacerTestId.Root).style.flexGrow).toBe("1");
  });

  it("applies spacing size to both axes", () => {
    render(<Spacer size="200" />);
    const el = screen.getByTestId(SpacerTestId.Root);
    expect(el.style.width).toBe("16px");
    expect(el.style.height).toBe("16px");
  });

  it("axis=x only sets width", () => {
    render(<Spacer size="100" axis="x" />);
    const el = screen.getByTestId(SpacerTestId.Root);
    expect(el.style.width).toBe("8px");
    expect(el.style.height).toBe("");
  });

  it("axis=y only sets height", () => {
    render(<Spacer size="100" axis="y" />);
    const el = screen.getByTestId(SpacerTestId.Root);
    expect(el.style.height).toBe("8px");
    expect(el.style.width).toBe("");
  });
});
