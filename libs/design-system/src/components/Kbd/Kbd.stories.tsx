import type { Meta, StoryObj } from "@storybook/react";
import { Kbd } from "./Kbd";

const meta: Meta<typeof Kbd> = {
  title: "Components/Kbd",
  component: Kbd,
  parameters: { backgrounds: { default: "velin" } },
  args: { children: "⌘K" },
};
export default meta;

type Story = StoryObj<typeof Kbd>;

export const Default: Story = {};

export const Shortcuts: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Kbd>⌘K</Kbd>
      <Kbd>⌘⇧P</Kbd>
      <Kbd>Enter</Kbd>
      <Kbd>Esc</Kbd>
      <Kbd>Tab</Kbd>
      <Kbd>⌥</Kbd>
      <Kbd>⌃</Kbd>
    </div>
  ),
};

export const InContext: Story = {
  render: () => (
    <span className="font-mono text-sm text-foreground-dim">
      Stiskněte <Kbd>⌘K</Kbd> pro paletu příkazů
    </span>
  ),
};

export const Playground: Story = {};
