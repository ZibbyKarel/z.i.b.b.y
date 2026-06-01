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
        <Typography mono type="subtitle" variant="tertiary">
          tones
        </Typography>
        <div className="flex flex-col gap-3">
          <Progress glow tone="ok" value={38} />
          <Progress glow tone="warn" value={64} />
          <Progress glow tone="bad" value={92} />
          <Progress glow tone="accent" value={36} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          heights
        </Typography>
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
