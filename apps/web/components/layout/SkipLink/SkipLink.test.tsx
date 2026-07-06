import { describe, expect, it } from "vitest";
import { render, screen } from "../../../test/render";
import { SkipLink, SkipLinkTestId } from "./SkipLink";

describe("SkipLink", () => {
  it("links to the target landmark with the given label", () => {
    render(<SkipLink label="Přeskočit na obsah" targetId="main-content" />);
    const link = screen.getByTestId(SkipLinkTestId.Root);
    expect(link).toHaveRole("link");
    expect(link).toHaveAccessibleName("Přeskočit na obsah");
    expect(link).toHaveAttribute("href", "#main-content");
  });

  it("is visually hidden until focused", () => {
    render(<SkipLink label="Skip to content" targetId="main-content" />);
    expect(screen.getByTestId(SkipLinkTestId.Root)).toHaveClass("sr-only");
  });
});
