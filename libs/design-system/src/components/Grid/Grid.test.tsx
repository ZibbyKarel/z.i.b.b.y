import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Grid, GridTestId } from "./Grid";

describe("Grid", () => {
  it("renders a responsive column grid", () => {
    render(<Grid cols={1} gap="150" lg={3} sm={2} />);
    const el = screen.getByTestId(GridTestId.Root);
    expect(el.style.display).toBe("grid");
    expect(el.className).toContain("grid-cols-1");
    expect(el.className).toContain("sm:grid-cols-2");
    expect(el.className).toContain("lg:grid-cols-3");
  });

  it("switches to the right-sidebar template", () => {
    render(<Grid sidebar="right" />);
    expect(screen.getByTestId(GridTestId.Root).className).toContain(
      "lg:grid-cols-[minmax(0,1fr)_360px]",
    );
  });

  it("switches to the left-sidebar template", () => {
    render(<Grid sidebar="left" />);
    expect(screen.getByTestId(GridTestId.Root).className).toContain(
      "lg:grid-cols-[320px_minmax(0,1fr)]",
    );
  });

  it("centres and constrains width", () => {
    render(<Grid center maxWidth="1400px" />);
    const el = screen.getByTestId(GridTestId.Root);
    expect(el.style.maxWidth).toBe("1400px");
    expect(el.style.marginInline).toBe("auto");
  });
});
