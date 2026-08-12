import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { Sparkline } from "./Sparkline";

const meta: Meta<typeof Sparkline> = {
  title: "DesignSystem/Sparkline",
  component: Sparkline,
  parameters: { backgrounds: { default: "velin" } },
  argTypes: {
    tone: { control: "select", options: ["accent", "ok", "warn", "bad", "run"] },
  },
  decorators: [
    (Story) => (
      <div className="w-[260px]">
        <Story />
      </div>
    ),
  ],
  args: { data: [4, 6, 9, 7, 12, 8, 14, 11, 9, 13, 16, 12, 10, 15] },
};
export default meta;

type Story = StoryObj<typeof Sparkline>;

export const Overview: Story = {
  render: () => (
    <div className="flex w-[260px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          upward trend
        </Typography>
        <Sparkline data={[4, 6, 9, 7, 12, 8, 14, 11, 9, 13, 16, 12, 10, 15]} />
      </div>
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          downward trend
        </Typography>
        <Sparkline data={[15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]} />
      </div>
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          stepped / bursty
        </Typography>
        <Sparkline data={[8, 8, 8, 14, 14, 5, 5, 12, 12, 8, 8, 16, 16, 8]} />
      </div>
    </div>
  ),
};

export const Playground: Story = {};
