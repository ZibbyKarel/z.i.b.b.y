import { describe, expect, it } from "vitest";
import type { NavItem } from "@zibby/design-system";
import { renderWithProviders, screen } from "../../../test/render";
import { CatalogProvider } from "../../../state/store";
import { MainLayout } from "./MainLayout";

const navItems: NavItem[] = [
  { id: "overview", glyph: "flow", href: "/overview", label: "Přehled" },
];

describe("MainLayout", () => {
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
});
