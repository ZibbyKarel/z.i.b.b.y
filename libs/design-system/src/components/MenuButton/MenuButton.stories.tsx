import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { MenuButton, type MenuButtonEntry, type MenuButtonItem } from "./MenuButton";

const ACTION_ITEMS: MenuButtonItem[] = [
  { id: "resume", label: "Pokračovat", icon: "run", onSelect: () => {} },
  { id: "assign", label: "Zařadit do projektu", icon: "plus", onSelect: () => {} },
  { id: "stop", label: "Zastavit běh", icon: "stop", danger: true, onSelect: () => {} },
  {
    id: "delete",
    label: "Smazat",
    icon: "x",
    danger: true,
    disabled: true,
    onSelect: () => {},
  },
];

// AppHeader's ⋮ overflow menu (ZB-06): a bordered trigger, mono-uppercase
// label-left/trailing-mark-right rows, a divider between groups, and
// SETTINGS/REGISTRIES rendered as real links.
const OVERFLOW_ENTRIES: MenuButtonEntry[] = [
  { id: "pin", label: "Pin page", trailing: "+", onSelect: () => {} },
  { id: "d1", divider: true },
  { id: "settings", label: "Settings", trailing: "⚙", href: "/system/settings" },
  { id: "registries", label: "Registries", trailing: "→", href: "/system/registries" },
];

const meta: Meta<typeof MenuButton> = {
  title: "DesignSystem/MenuButton",
  component: MenuButton,
  parameters: { backgrounds: { default: "velin" } },
  argTypes: {
    intent: { control: "select", options: ["primary", "ghost", "danger"] },
    size: { control: "select", options: ["sm", "md"] },
  },
  args: {
    items: ACTION_ITEMS,
    ariaLabel: "Akce běhu",
  },
};
export default meta;

type Story = StoryObj<typeof MenuButton>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Typography type="label">default (kebab trigger, no visible primary segment)</Typography>
        <div className="flex flex-wrap gap-3">
          <MenuButton ariaLabel="Akce běhu" items={ACTION_ITEMS} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="label">intents</Typography>
        <div className="flex flex-wrap items-center gap-3">
          <MenuButton ariaLabel="Akce běhu" intent="ghost" items={ACTION_ITEMS} />
          <MenuButton ariaLabel="Akce běhu" intent="primary" items={ACTION_ITEMS} />
          <MenuButton ariaLabel="Akce běhu" intent="danger" items={ACTION_ITEMS} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="label">sizes</Typography>
        <div className="flex flex-wrap items-center gap-3">
          <MenuButton ariaLabel="Akce běhu" items={ACTION_ITEMS} size="sm" />
          <MenuButton ariaLabel="Akce běhu" items={ACTION_ITEMS} size="md" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="label">disabled trigger</Typography>
        <div className="flex flex-wrap items-center gap-3">
          <MenuButton disabled ariaLabel="Akce běhu" items={ACTION_ITEMS} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="label">
          variant=&quot;bordered&quot; (AppHeader ⋮ overflow menu) — trailing marks, divider, href
          rows
        </Typography>
        <div className="flex flex-wrap items-center gap-3">
          <MenuButton ariaLabel="More" items={OVERFLOW_ENTRIES} variant="bordered" />
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
