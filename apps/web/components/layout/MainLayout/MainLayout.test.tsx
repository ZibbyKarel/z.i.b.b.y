import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { NavItem } from "@zibby/design-system";
import { renderWithProviders, screen } from "../../../test/render";
import { CatalogProvider } from "../../../state/store";
import { TopBarTestId } from "../TopBar/TopBar";
import { SkipLinkTestId } from "../SkipLink/SkipLink";
import { MainLayout } from "./MainLayout";

// MainLayout renders BrandLogo, which reads the Phase 25 project scope; stub it
// to the "Bez projektu" default so these layout-shell tests stay focused on
// layout/rail behaviour rather than project-registry data.
vi.mock("../../../features/projects", () => ({
  useActiveProject: () => ({ activeProjectId: null, setActiveProject: vi.fn() }),
  useProjectsQuery: () => ({ data: [] }),
}));

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

  it("renders a main landmark holding the page content", () => {
    renderWithProviders(
      <CatalogProvider>
        <MainLayout activeNav="overview" breadcrumb="Moje cesta" navItems={navItems}>
          <div>obsah stránky</div>
        </MainLayout>
      </CatalogProvider>,
    );
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main-content");
    expect(screen.getByText("obsah stránky")).toBeInTheDocument();
  });

  it("puts the skip-link first in tab order, jumping to the main landmark", () => {
    renderWithProviders(
      <CatalogProvider>
        <MainLayout activeNav="overview" breadcrumb="Moje cesta" navItems={navItems}>
          <div>obsah stránky</div>
        </MainLayout>
      </CatalogProvider>,
    );
    const focusable = document.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
    );
    const skipLink = screen.getByTestId(SkipLinkTestId.Root);
    expect(focusable[0]).toBe(skipLink);
    expect(skipLink).toHaveAttribute("href", "#main-content");
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
