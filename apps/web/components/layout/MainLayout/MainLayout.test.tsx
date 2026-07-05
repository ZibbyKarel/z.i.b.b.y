import { beforeEach, describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import type { NavItem } from "@zibby/design-system";
import { renderWithProviders, screen } from "../../../test/render";
import { CatalogProvider } from "../../../state/store";
import { TopBarTestId } from "../TopBar/TopBar";
import { MainLayout } from "./MainLayout";

const RAIL_CONTENT_TESTID = "test-rail-content";

const navItems: NavItem[] = [
  { id: "overview", glyph: "flow", href: "/overview", label: "Přehled" },
];

describe("MainLayout", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the breadcrumb and the page content (smoke)", () => {
    renderWithProviders(
      <CatalogProvider>
        <MainLayout activeNav="overview" breadcrumb="Moje cesta" navItems={navItems}>
          <div>obsah stránky</div>
        </MainLayout>
      </CatalogProvider>,
    );
    expect(screen.getByText("Moje cesta")).toBeInTheDocument();
    expect(screen.getByText("obsah stránky")).toBeInTheDocument();
  });

  it("shows the rail when railSlot is provided, and hides it on toggle click", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CatalogProvider>
        <MainLayout
          activeNav="overview"
          breadcrumb="Moje cesta"
          navItems={navItems}
          railSlot={<div data-testid={RAIL_CONTENT_TESTID}>rail obsah</div>}
        >
          <div>obsah stránky</div>
        </MainLayout>
      </CatalogProvider>,
    );

    expect(screen.getByTestId(RAIL_CONTENT_TESTID)).toBeInTheDocument();
    const toggle = screen.getByTestId(TopBarTestId.RailToggle);
    expect(toggle).toHaveAccessibleName("Skrýt postranní panel");
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    await user.click(toggle);

    expect(screen.queryByTestId(RAIL_CONTENT_TESTID)).not.toBeInTheDocument();
    expect(toggle).toHaveAccessibleName("Zobrazit postranní panel");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("does not render the rail toggle when no railSlot is provided", () => {
    renderWithProviders(
      <CatalogProvider>
        <MainLayout activeNav="overview" breadcrumb="Moje cesta" navItems={navItems}>
          <div>obsah stránky</div>
        </MainLayout>
      </CatalogProvider>,
    );

    expect(screen.queryByTestId(TopBarTestId.RailToggle)).not.toBeInTheDocument();
  });
});
