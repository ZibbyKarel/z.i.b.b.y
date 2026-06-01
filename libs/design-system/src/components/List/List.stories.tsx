import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import type { NavItem } from "./List";
import {
  List,
  ListItem,
  ListItemBadge,
  ListItemIcon,
  ListItemText,
} from "./List";

const navItems: NavItem[] = [
  { id: "overview", label: "Přehled", glyph: "grid" },
  { id: "skills", label: "Skilly", glyph: "spark" },
  { id: "agents", label: "Agenti", glyph: "bot" },
  { id: "pipelines", label: "Orchestrace", glyph: "flow" },
  { id: "integrations", label: "Integrace", glyph: "plug" },
  { id: "automations", label: "Automatizace", glyph: "clock" },
  { id: "memory", label: "Paměť", glyph: "brain" },
  { id: "runs", label: "Běžící agenti", glyph: "pulse", badge: 2 },
];

const settingsItem: NavItem = {
  id: "settings",
  label: "Nastavení systému",
  glyph: "gear",
};

const meta: Meta<typeof List> = {
  title: "DesignSystem/List",
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
      <div className="flex min-h-0 flex-1 flex-col">
        <List>
          {navItems.map((item) => (
            <ListItem
              active={item.id === active}
              key={item.id}
              onSelect={() => setActive(item.id)}
            >
              <ListItemIcon glyph={item.glyph} />
              <ListItemText>{item.label}</ListItemText>
              {item.badge ? <ListItemBadge>{item.badge}</ListItemBadge> : null}
            </ListItem>
          ))}
        </List>
        <div className="mt-auto border-t border-border pt-3">
          <ListItem
            active={settingsItem.id === active}
            onSelect={() => setActive(settingsItem.id)}
          >
            <ListItemIcon glyph={settingsItem.glyph} />
            <ListItemText>{settingsItem.label}</ListItemText>
          </ListItem>
        </div>
      </div>
    );
  },
};

export const Playground: Story = {
  render: () => {
    const [active, setActive] = useState("skills");
    return (
      <List>
        {navItems.slice(0, 4).map((item) => (
          <ListItem
            active={item.id === active}
            key={item.id}
            onSelect={() => setActive(item.id)}
          >
            <ListItemIcon glyph={item.glyph} />
            <ListItemText>{item.label}</ListItemText>
          </ListItem>
        ))}
      </List>
    );
  },
};
