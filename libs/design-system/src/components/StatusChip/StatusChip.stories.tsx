import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { StatusChip } from "./StatusChip";

const meta: Meta<typeof StatusChip> = {
  title: "DesignSystem/StatusChip",
  component: StatusChip,
  parameters: { backgrounds: { default: "velin" } },
  argTypes: {
    state: { control: "select", options: ["ok", "run", "wait", "bad", "idle"] },
  },
  args: { state: "run" },
};
export default meta;

type Story = StoryObj<typeof StatusChip>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Typography type="label">states</Typography>
        <div className="flex flex-wrap items-center gap-3">
          <StatusChip state="ok">hotovo</StatusChip>
          <StatusChip state="run">běží</StatusChip>
          <StatusChip state="wait">čeká na tebe</StatusChip>
          <StatusChip state="bad">chyba</StatusChip>
          <StatusChip state="idle">idle</StatusChip>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="label">default english labels</Typography>
        <div className="flex flex-wrap items-center gap-3">
          <StatusChip state="ok" />
          <StatusChip state="run" />
          <StatusChip state="wait" />
          <StatusChip state="bad" />
          <StatusChip state="idle" />
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
