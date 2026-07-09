import { describe, expect, it } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { BrandLogo } from "./BrandLogo";

describe("BrandLogo", () => {
  it("renders the static z.i.b.b.y brand with tagline, linking to /overview", () => {
    renderWithProviders(<BrandLogo />);
    expect(screen.getByText("Zestful Intuitive Brainy Butler for You")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/overview");
  });

  // Phase 108: the brand no longer swaps to a project's own logo/name — there is
  // no "active project" scope left for it to reflect. ZIBBY always shows every
  // project's data at once, so the sidebar brand is unconditionally static.
  it("never swaps the brand for a project's own logo or name", () => {
    renderWithProviders(<BrandLogo />);
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });
});
