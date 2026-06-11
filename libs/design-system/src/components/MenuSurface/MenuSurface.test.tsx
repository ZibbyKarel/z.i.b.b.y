import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MenuSurface, MenuSurfaceTestId } from "./MenuSurface";

describe("MenuSurface", () => {
  it("renders children inside the surface", () => {
    render(<MenuSurface>menu body</MenuSurface>);
    expect(screen.getByTestId(MenuSurfaceTestId.Root)).toHaveTextContent("menu body");
  });

  it("stretches to both edges by default and clips without scroll", () => {
    render(<MenuSurface>x</MenuSurface>);
    const root = screen.getByTestId(MenuSurfaceTestId.Root);
    expect(root.className).toContain("left-0");
    expect(root.className).toContain("right-0");
    expect(root.className).toContain("overflow-hidden");
  });

  it("right-aligns with a min width when align is end", () => {
    render(<MenuSurface align="end">x</MenuSurface>);
    const root = screen.getByTestId(MenuSurfaceTestId.Root);
    expect(root.className).toContain("min-w-[168px]");
    expect(root.className).not.toContain("left-0");
  });

  it("caps height and scrolls when scroll is set", () => {
    render(<MenuSurface scroll>x</MenuSurface>);
    const root = screen.getByTestId(MenuSurfaceTestId.Root);
    expect(root.className).toContain("overflow-y-auto");
    expect(root.className).not.toContain("overflow-hidden");
  });

  it("lets a consumer override the role, id and test-id", () => {
    render(
      <MenuSurface data-testid="custom-panel" id="listbox-1" role="listbox">
        x
      </MenuSurface>,
    );
    const panel = screen.getByTestId("custom-panel");
    expect(panel).toHaveRole("listbox");
    expect(panel).toHaveAttribute("id", "listbox-1");
  });
});
