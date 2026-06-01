import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon, IconTestId, iconNames } from "./Icon";

describe("Icon", () => {
  it.each(iconNames)("renders %s glyph", (iconName) => {
    render(<Icon name={iconName} />);
    expect(screen.getByTestId(IconTestId.Root)).toBeInTheDocument();
  });

  it("applies size and stroke", () => {
    render(<Icon name="play" size="xl" stroke="medium" />);
    const svg = screen.getByTestId(IconTestId.Root);
    expect(svg.getAttribute("width")).toBe("24");
    expect(svg.getAttribute("stroke-width")).toBe("2");
  });

  it("is hidden from the accessibility tree by default", () => {
    render(<Icon name="ok" />);
    expect(screen.getByTestId(IconTestId.Root).getAttribute("aria-hidden")).toBe("true");
  });

  it("applies a semantic tone colour class", () => {
    render(<Icon name="ok" tone="bad" />);
    expect(screen.getByTestId(IconTestId.Root).getAttribute("class")).toContain("text-bad");
  });
});
