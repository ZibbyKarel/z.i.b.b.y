import type { Meta, StoryObj } from "@storybook/react";
import { Badge, type BadgeTone } from "./Badge";

const meta: Meta<typeof Badge> = {
  title: "Components/Badge",
  component: Badge,
  parameters: { backgrounds: { default: "velin" } },
  args: { children: "neutral", tone: "neutral" },
};
export default meta;

type Story = StoryObj<typeof Badge>;

export const Default: Story = {};

const tones: BadgeTone[] = ["neutral", "accent", "ok", "warn", "bad", "run", "opus", "sonnet", "haiku"];

export const Tones: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {tones.map((tone) => (
        <Badge key={tone} tone={tone}>{tone}</Badge>
      ))}
    </div>
  ),
};

export const Solid: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {tones.map((tone) => (
        <Badge key={tone} tone={tone} solid>{tone}</Badge>
      ))}
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Badge size="sm">sm</Badge>
      <Badge size="md">md</Badge>
    </div>
  ),
};

export const Playground: Story = {};
