import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { SkipLink, SkipLinkTestId } from "./SkipLink";

describe("SkipLink", () => {
  it("renders the default label", () => {
    render(<SkipLink targetId="main-content" />);
    expect(screen.getByTestId(SkipLinkTestId.Root)).toHaveTextContent("Skip to main content");
  });

  it("renders a custom label", () => {
    render(<SkipLink label="Přeskočit na obsah" targetId="main-content" />);
    expect(screen.getByTestId(SkipLinkTestId.Root)).toHaveTextContent("Přeskočit na obsah");
  });

  it("links to the given target id", () => {
    render(<SkipLink targetId="main-content" />);
    expect(screen.getByTestId(SkipLinkTestId.Root)).toHaveAttribute("href", "#main-content");
  });

  it("renders as a link with an accessible name", () => {
    render(<SkipLink targetId="main-content" />);
    const el = screen.getByTestId(SkipLinkTestId.Root);
    expect(el).toHaveRole("link");
    expect(el).toHaveAccessibleName("Skip to main content");
  });
});
