import type { Meta, StoryObj } from "@storybook/react";
import { Chip } from "./Chip";

const meta: Meta<typeof Chip> = {
  title: "Components/Chip",
  component: Chip,
  parameters: { backgrounds: { default: "velin" } },
  args: { children: "hotovo", tone: "ok" },
};
export default meta;

type Story = StoryObj<typeof Chip>;

export const Default: Story = {};

export const Tones: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Chip tone="neutral">neutral</Chip>
      <Chip tone="accent">work</Chip>
      <Chip tone="ok">hotovo</Chip>
      <Chip tone="warn">zaparkováno</Chip>
      <Chip tone="bad">selhalo</Chip>
      <Chip tone="opus">opus</Chip>
      <Chip tone="sonnet">sonnet</Chip>
      <Chip tone="haiku">haiku</Chip>
      <Chip tone="think-high">◇ high</Chip>
      <Chip tone="think-medium">◇ medium</Chip>
      <Chip tone="think-low">◇ low</Chip>
    </div>
  ),
};

export const Solid: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Chip tone="accent" solid>accent</Chip>
      <Chip tone="ok" solid>ok</Chip>
      <Chip tone="warn" solid>warn</Chip>
      <Chip tone="bad" solid>bad</Chip>
    </div>
  ),
};
