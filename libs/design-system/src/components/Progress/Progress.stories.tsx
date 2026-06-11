import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { Progress } from "./Progress";

const meta: Meta<typeof Progress> = {
  title: "DesignSystem/Progress",
  component: Progress,
  parameters: { backgrounds: { default: "velin" } },
  args: { value: 64, tone: "warn", height: "50" },
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
        <Typography type="label">tones (matte — bars never glow)</Typography>
        <div className="flex flex-col gap-3">
          <Progress tone="ok" value={38} />
          <Progress tone="warn" value={64} />
          <Progress tone="bad" value={92} />
          <Progress tone="run" value={48} />
          <Progress tone="accent" value={36} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="label">heights</Typography>
        <div className="flex flex-col gap-3">
          <Progress height="50" tone="ok" value={60} />
          <Progress height="75" tone="ok" value={60} />
          <Progress height="100" tone="ok" value={60} />
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
