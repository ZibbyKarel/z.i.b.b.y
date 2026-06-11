import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { RiskTag } from "./RiskTag";

const meta: Meta<typeof RiskTag> = {
  title: "DesignSystem/RiskTag",
  component: RiskTag,
  parameters: { backgrounds: { default: "velin" } },
  argTypes: {
    risk: { control: "select", options: ["payment", "deletion", "push", "send"] },
    size: { control: "select", options: ["sm", "md"] },
  },
  args: { risk: "payment", size: "sm" },
};
export default meta;

type Story = StoryObj<typeof RiskTag>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Typography type="label">risk kinds</Typography>
        <div className="flex flex-wrap items-center gap-3">
          <RiskTag risk="payment">platba</RiskTag>
          <RiskTag risk="deletion">mazání</RiskTag>
          <RiskTag risk="push">push</RiskTag>
          <RiskTag risk="send">odeslání</RiskTag>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="label">md (voice density)</Typography>
        <div className="flex flex-wrap items-center gap-3">
          <RiskTag risk="payment" size="md">
            platba
          </RiskTag>
          <RiskTag risk="deletion" size="md">
            mazání
          </RiskTag>
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
