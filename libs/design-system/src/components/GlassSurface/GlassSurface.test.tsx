import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GlassSurface, GlassSurfaceTestId } from "./GlassSurface";

describe("GlassSurface", () => {
  it("renders children on a glass root", () => {
    const { getByTestId } = render(<GlassSurface>hi</GlassSurface>);
    const root = getByTestId(GlassSurfaceTestId.Root);
    expect(root).toHaveTextContent("hi");
    expect(root.style.backgroundImage || root.style.background).toContain("gradient-glass");
  });

  it("maps radius='pill' to the full radius", () => {
    const { getByTestId } = render(<GlassSurface radius="pill">x</GlassSurface>);
    expect(getByTestId(GlassSurfaceTestId.Root).style.borderRadius).toBe("9999px");
  });
});
