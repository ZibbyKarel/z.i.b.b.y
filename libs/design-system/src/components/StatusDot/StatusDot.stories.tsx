import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { StatusDot } from "./StatusDot";

const meta: Meta<typeof StatusDot> = {
  title: "DesignSystem/StatusDot",
  component: StatusDot,
  parameters: { backgrounds: { default: "velin" } },
  args: { tone: "ok", size: "100", pulse: false },
};
export default meta;

type Story = StoryObj<typeof StatusDot>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Typography type="label">states (matte)</Typography>
        <div className="flex items-center gap-5">
          <StatusDot tone="ok" />
          <StatusDot tone="run" />
          <StatusDot tone="wait" />
          <StatusDot tone="bad" />
          <StatusDot tone="idle" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="label">live (pulse + glow)</Typography>
        <div className="flex items-center gap-5">
          <StatusDot pulse tone="run" />
          <StatusDot pulse tone="wait" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="label">sizes</Typography>
        <div className="flex items-center gap-5">
          <StatusDot size="75" tone="ok" />
          <StatusDot size="100" tone="ok" />
          <StatusDot size="150" tone="ok" />
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
