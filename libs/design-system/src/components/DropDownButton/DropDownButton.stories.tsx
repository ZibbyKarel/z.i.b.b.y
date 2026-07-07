import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { DropDownButton, type DropDownButtonItem } from "./DropDownButton";

const RUN_LATER_ITEMS: DropDownButtonItem[] = [
  { id: "in-1h", label: "in 1h", icon: "clock", onSelect: () => {} },
  { id: "on-limits", label: "when limits reset", icon: "wait", onSelect: () => {} },
  { id: "on-schedule", label: "on a schedule…", icon: "checkpoint", disabled: true, onSelect: () => {} },
];

const meta: Meta<typeof DropDownButton> = {
  title: "DesignSystem/DropDownButton",
  component: DropDownButton,
  parameters: { backgrounds: { default: "velin" } },
  argTypes: {
    intent: { control: "select", options: ["primary", "ghost", "danger"] },
    size: { control: "select", options: ["sm", "md"] },
  },
  args: {
    label: "Spustit",
    icon: "play",
    intent: "primary",
    size: "md",
    menuItems: RUN_LATER_ITEMS,
    menuAriaLabel: "Naplánovat spuštění",
  },
};
export default meta;

type Story = StoryObj<typeof DropDownButton>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Typography type="label">default</Typography>
        <div className="flex flex-wrap gap-3">
          <DropDownButton
            icon="play"
            label="Spustit"
            menuAriaLabel="Naplánovat spuštění"
            menuItems={RUN_LATER_ITEMS}
            onClick={() => {}}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="label">intents</Typography>
        <div className="flex flex-wrap gap-3">
          <DropDownButton
            icon="play"
            intent="primary"
            label="Spustit"
            menuItems={RUN_LATER_ITEMS}
            onClick={() => {}}
          />
          <DropDownButton
            icon="retry"
            intent="ghost"
            label="Znovu"
            menuItems={RUN_LATER_ITEMS}
            onClick={() => {}}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="label">states</Typography>
        <div className="flex flex-wrap items-center gap-3">
          <DropDownButton
            loading
            icon="play"
            label="Spouštím…"
            menuItems={RUN_LATER_ITEMS}
            onClick={() => {}}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="label">disabled — both halves + divider read as one inert unit</Typography>
        <div className="flex flex-wrap items-center gap-3">
          <DropDownButton
            disabled
            icon="play"
            intent="primary"
            label="Spustit"
            menuItems={RUN_LATER_ITEMS}
            onClick={() => {}}
          />
          <DropDownButton
            disabled
            icon="retry"
            intent="ghost"
            label="Znovu"
            menuItems={RUN_LATER_ITEMS}
            onClick={() => {}}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="label">sizes</Typography>
        <div className="flex flex-wrap items-center gap-3">
          <DropDownButton
            icon="play"
            label="Spustit"
            menuItems={RUN_LATER_ITEMS}
            onClick={() => {}}
            size="sm"
          />
          <DropDownButton
            icon="play"
            label="Spustit"
            menuItems={RUN_LATER_ITEMS}
            onClick={() => {}}
            size="md"
          />
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
