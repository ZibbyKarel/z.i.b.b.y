import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { ProgressRing } from "./ProgressRing";

const meta: Meta<typeof ProgressRing> = {
  title: "DesignSystem/ProgressRing",
  component: ProgressRing,
  parameters: { backgrounds: { default: "velin" } },
  argTypes: {
    tone: { control: "select", options: ["accent", "ok", "warn", "bad", "run"] },
    size: { control: "select", options: ["sm", "md", "lg"] },
  },
  args: { value: 64, tone: "warn", size: "md" },
};
export default meta;

type Story = StoryObj<typeof ProgressRing>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Typography type="label">tones</Typography>
        <div className="flex items-center gap-4">
          <ProgressRing tone="ok" value={32} />
          <ProgressRing tone="warn" value={64} />
          <ProgressRing tone="bad" value={91} />
          <ProgressRing tone="run" value={48} />
          <ProgressRing tone="accent" value={75} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="label">sizes</Typography>
        <div className="flex items-center gap-4">
          <ProgressRing size="sm" tone="ok" value={64} />
          <ProgressRing size="md" tone="ok" value={64} />
          <ProgressRing size="lg" tone="ok" value={64} />
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
