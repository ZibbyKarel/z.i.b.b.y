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
        <Typography mono type="subtitle" variant="tertiary">
          tones
        </Typography>
        <div className="flex items-center gap-5">
          <StatusDot pulse tone="ok" />
          <StatusDot tone="warn" />
          <StatusDot pulse tone="bad" />
          <StatusDot pulse tone="run" />
          <StatusDot tone="home" />
          <StatusDot tone="work" />
          <StatusDot tone="faint" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          sizes
        </Typography>
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
