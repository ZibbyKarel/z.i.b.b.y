import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
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

export const Overview: Story = {
  render: () => (
    <div className="flex w-64 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Typography type="subtitle" variant="tertiary" mono>
          tones
        </Typography>
        <div className="flex flex-col gap-3">
          <Progress value={38} tone="ok" glow />
          <Progress value={64} tone="warn" glow />
          <Progress value={92} tone="bad" glow />
          <Progress value={36} tone="accent" glow />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="subtitle" variant="tertiary" mono>
          heights
        </Typography>
        <div className="flex flex-col gap-3">
          <Progress value={60} tone="ok" height="50" />
          <Progress value={60} tone="ok" height="75" />
          <Progress value={60} tone="ok" height="100" />
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
