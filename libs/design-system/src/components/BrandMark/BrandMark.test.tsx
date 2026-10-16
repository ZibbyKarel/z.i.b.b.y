import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { BrandMark, BrandMarkTestId } from "./BrandMark";

describe("BrandMark", () => {
  it("renders 30px by default and is decorative", () => {
    render(<BrandMark />);
    const el = screen.getByTestId(BrandMarkTestId.Root);
    expect(el).toHaveAttribute("width", "30");
    expect(el).toHaveAttribute("height", "30");
    expect(el).toHaveAttribute("aria-hidden", "true");
    expect(el).not.toHaveAttribute("role");
  });

  it("honours a sanctioned size", () => {
    render(<BrandMark size={64} />);
    expect(screen.getByTestId(BrandMarkTestId.Root)).toHaveAttribute("width", "64");
  });

  it("is an image with an accessible name when labelled", () => {
    render(<BrandMark label="ZibbyCorp" />);
    const el = screen.getByTestId(BrandMarkTestId.Root);
    expect(el).toHaveRole("img");
    expect(el).toHaveAccessibleName("ZibbyCorp");
    expect(el).not.toHaveAttribute("aria-hidden");
  });
});
