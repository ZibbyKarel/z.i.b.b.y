import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { Kbd } from "./Kbd";

const meta: Meta<typeof Kbd> = {
  title: "Components/Kbd",
  component: Kbd,
  parameters: { backgrounds: { default: "velin" } },
  args: { children: "⌘K" },
};
export default meta;

type Story = StoryObj<typeof Kbd>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          shortcuts
        </Typography>
        <div className="flex flex-wrap items-center gap-2">
          <Kbd>⌘K</Kbd>
          <Kbd>⌘⇧P</Kbd>
          <Kbd>Enter</Kbd>
          <Kbd>Esc</Kbd>
          <Kbd>Tab</Kbd>
          <Kbd>⌥</Kbd>
          <Kbd>⌃</Kbd>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          inline in text
        </Typography>
        <span className="font-mono text-sm text-foreground-dim">
          Stiskněte <Kbd>⌘K</Kbd> pro paletu příkazů
        </span>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
