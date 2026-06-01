import type { Meta, StoryObj } from "@storybook/react";
import { Progress } from "./Progress";

const meta: Meta<typeof Progress> = {
  title: "Components/Progress",
  component: Progress,
  parameters: { backgrounds: { default: "velin" } },
  args: { value: 64, tone: "warn", glow: true, height: "75" },
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof Progress>;

export const Default: Story = {};

export const Tones: Story = {
  render: () => (
    <div className="flex w-64 flex-col gap-3">
      <Progress value={38} tone="ok" glow />
      <Progress value={64} tone="warn" glow />
      <Progress value={92} tone="bad" glow />
      <Progress value={36} tone="accent" glow />
    </div>
  ),
};
