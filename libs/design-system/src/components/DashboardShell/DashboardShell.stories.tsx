import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import type { ContextName } from "../../DesignSystemContext/contextTokens";
import { HudPanel } from "../HudPanel/HudPanel";
import { DashboardShell } from "./DashboardShell";
import type { NavItem } from "../Sidebar/Sidebar";

const navItems: NavItem[] = [
  { id: "overview", label: "Přehled", glyph: "grid" },
  { id: "skills", label: "Skilly", glyph: "spark" },
  { id: "pipelines", label: "Orchestrace", glyph: "flow" },
  { id: "runs", label: "Běžící agenti", glyph: "pulse", badge: 2 },
];

/** A neutral stand-in for the app-injected wallet/limits widget. */
const walletSlot = (
  <div className="rounded border border-border px-3 py-1.5 font-mono text-sm text-foreground-dim">
    wallet slot
  </div>
);

const meta: Meta<typeof DashboardShell> = {
  title: "Dashboard/DashboardShell",
  component: DashboardShell,
  parameters: { backgrounds: { default: "velin" }, layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof DashboardShell>;

export const Default: Story = {
  render: () => {
    const [ctx, setCtx] = useState<ContextName>("home");
    const [nav, setNav] = useState("overview");
    return (
      <div className="h-screen">
        <DashboardShell
          context={ctx}
          onContextChange={setCtx}
          navItems={navItems}
          activeNav={nav}
          onNavigate={setNav}
          footerItem={{
            id: "settings",
            label: "Nastavení systému",
            glyph: "gear",
          }}
          breadcrumb="Přehled"
          walletSlot={walletSlot}
        >
          <HudPanel title="přehled" className="max-w-3xl">
            <p className="text-md text-foreground-dim">
              Sem patří tělo obrazovky.
            </p>
          </HudPanel>
        </DashboardShell>
      </div>
    );
  },
};
