import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { StatusDot } from "./StatusDot";

const meta: Meta<typeof StatusDot> = {
  title: "Components/StatusDot",
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
        <Typography type="subtitle" variant="tertiary" mono>
          tones
        </Typography>
        <div className="flex items-center gap-5">
          <StatusDot tone="ok" pulse />
          <StatusDot tone="warn" />
          <StatusDot tone="bad" pulse />
          <StatusDot tone="run" pulse />
          <StatusDot tone="home" />
          <StatusDot tone="work" />
          <StatusDot tone="faint" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="subtitle" variant="tertiary" mono>
          sizes
        </Typography>
        <div className="flex items-center gap-5">
          <StatusDot tone="ok" size="75" />
          <StatusDot tone="ok" size="100" />
          <StatusDot tone="ok" size="150" />
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
