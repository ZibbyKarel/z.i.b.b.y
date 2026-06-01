import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Sidebar, type NavItem } from "./Sidebar";

const items: NavItem[] = [
  { id: "overview", label: "Přehled", glyph: "grid" },
  { id: "skills", label: "Skilly", glyph: "spark" },
  { id: "agents", label: "Agenti", glyph: "bot" },
  { id: "pipelines", label: "Orchestrace", glyph: "flow" },
  { id: "integrations", label: "Integrace", glyph: "plug" },
  { id: "automations", label: "Automatizace", glyph: "clock" },
  { id: "memory", label: "Paměť", glyph: "brain" },
  { id: "runs", label: "Běžící agenti", glyph: "pulse", badge: 2 },
];

const meta: Meta<typeof Sidebar> = {
  title: "Dashboard/Sidebar",
  component: Sidebar,
  parameters: { backgrounds: { default: "velin" }, layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="h-screen">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof Sidebar>;

export const Default: Story = {
  render: () => {
    const [active, setActive] = useState("overview");
    return (
      <Sidebar
        items={items}
        active={active}
        onNavigate={setActive}
        footerItem={{
          id: "settings",
          label: "Nastavení systému",
          glyph: "gear",
        }}
      />
    );
  },
};
