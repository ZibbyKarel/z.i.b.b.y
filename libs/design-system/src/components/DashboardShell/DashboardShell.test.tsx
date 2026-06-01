import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { NavItem } from "../Sidebar/Sidebar";
import { DashboardShell } from "./DashboardShell";

const navItems: NavItem[] = [
  { id: "overview", label: "Přehled", glyph: "grid" },
  { id: "pipelines", label: "Orchestrace", glyph: "flow" },
];

describe("DashboardShell", () => {
  it("renders chrome and content together", () => {
    render(
      <DashboardShell
        context="home"
        onContextChange={() => {}}
        navItems={navItems}
        activeNav="overview"
        onNavigate={() => {}}
        breadcrumb="Přehled"
        walletSlot={<div>wallet</div>}
      >
        <div>tělo dashboardu</div>
      </DashboardShell>,
    );
    expect(
      screen.getByRole("navigation", { name: "Main navigation" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Přepínač kontextu" }),
    ).toBeInTheDocument();
    expect(screen.getByText("tělo dashboardu")).toBeInTheDocument();
  });
});
