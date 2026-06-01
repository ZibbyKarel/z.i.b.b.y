import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { List, type ListItem } from "./List";

const items: ListItem[] = [
  { id: "overview", label: "Přehled", glyph: "grid" },
  { id: "skills", label: "Skilly", glyph: "spark" },
  { id: "agents", label: "Agenti", glyph: "bot" },
  { id: "pipelines", label: "Orchestrace", glyph: "flow" },
  { id: "integrations", label: "Integrace", glyph: "plug" },
  { id: "automations", label: "Automatizace", glyph: "clock" },
  { id: "memory", label: "Paměť", glyph: "brain" },
  { id: "runs", label: "Běžící agenti", glyph: "pulse", badge: 2 },
];

const meta: Meta<typeof List> = {
  title: "Dashboard/List",
  component: List,
  parameters: { backgrounds: { default: "velin" }, layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="h-screen w-56 bg-surface-0 px-3.5 py-6">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof List>;

export const Overview: Story = {
  render: () => {
    const [active, setActive] = useState("overview");
    return (
      <List
        items={items}
        active={active}
        onNavigate={setActive}
        footerItem={{ id: "settings", label: "Nastavení systému", glyph: "gear" }}
      />
    );
  },
};

export const Playground: Story = {
  render: () => {
    const [active, setActive] = useState("skills");
    return (
      <List
        items={items.slice(0, 4)}
        active={active}
        onNavigate={setActive}
      />
    );
  },
};
