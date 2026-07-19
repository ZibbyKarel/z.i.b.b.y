import { describe, expect, it } from "vitest";
import { ListTestId, type NavItem } from "@zibby/design-system";
import { renderWithProviders, screen } from "../../../test/render";
import { Sidebar } from "./Sidebar";

const navItems: NavItem[] = [
  { id: "home", glyph: "flow", href: "/chat", label: "Přehled" },
  { id: "skills", glyph: "spark", href: "/skills", label: "Skilly" },
];

const footerItem: NavItem = {
  id: "settings",
  glyph: "bot",
  href: "/settings",
  label: "Nastavení",
};

describe("Sidebar", () => {
  it("renders a link for each nav item", () => {
    renderWithProviders(<Sidebar activeNav="home" navItems={navItems} />);
    expect(screen.getByText("Přehled")).toBeInTheDocument();
    expect(screen.getByText("Skilly")).toBeInTheDocument();
  });

  it("renders the footer item when provided", () => {
    renderWithProviders(<Sidebar activeNav="home" footerItem={footerItem} navItems={navItems} />);
    expect(screen.getByText("Nastavení")).toBeInTheDocument();
  });

  it("renders a badge with its count and accessible label when present", () => {
    renderWithProviders(
      <Sidebar
        activeNav="home"
        navItems={[
          {
            id: "archiv",
            glyph: "pulse",
            href: "/archiv",
            label: "Běhy",
            badge: 3,
            badgeLabel: "3 items need attention",
          },
        ]}
      />,
    );
    const badge = screen.getByTestId(ListTestId.Badge);
    expect(badge).toHaveTextContent("3");
    expect(badge).toHaveAccessibleName("3 items need attention");
  });

  it("hides the badge at zero (no badge prop)", () => {
    renderWithProviders(<Sidebar activeNav="home" navItems={navItems} />);
    expect(screen.queryByTestId(ListTestId.Badge)).not.toBeInTheDocument();
  });
});
