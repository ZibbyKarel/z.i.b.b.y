import type { Meta, StoryObj } from "@storybook/react";
import { STATE_ORDER } from "../../stateTone";
import { Typography } from "../Typography/Typography";
import { StatePill } from "./StatePill";

const meta: Meta<typeof StatePill> = {
  title: "DesignSystem/StatePill",
  component: StatePill,
  parameters: { backgrounds: { default: "velin" } },
  args: { state: "working" },
};
export default meta;

type Story = StoryObj<typeof StatePill>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-8 p-12">
      <div className="flex flex-col gap-3">
        <Typography type="label">default label, every state</Typography>
        <div className="flex flex-col items-start gap-2">
          {STATE_ORDER.map((state) => (
            <StatePill key={state} state={state} />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Typography type="label">overridden label — task-specific phrase</Typography>
        <StatePill label="Migrating billing service to v2 API" state="working" />
      </div>
    </div>
  ),
};

export const Playground: Story = {};
