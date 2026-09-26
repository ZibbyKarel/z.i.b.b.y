import type { Meta, StoryObj } from "@storybook/react";
import { STATE_LABEL, STATE_ORDER } from "../../stateTone";
import { Legend } from "./Legend";
import type { LegendItem } from "./Legend";

const meta: Meta<typeof Legend> = {
  title: "DesignSystem/Legend",
  component: Legend,
  args: {},
};
export default meta;

type Story = StoryObj<typeof Legend>;

const ITEMS: LegendItem[] = STATE_ORDER.map((state, i) => ({
  state,
  label: STATE_LABEL[state],
  count: (i + 1) * 3,
}));

export const Overview: Story = {
  render: () => (
    <div className="max-w-xs p-8">
      <Legend items={ITEMS} />
    </div>
  ),
};

export const Playground: Story = {
  args: { items: ITEMS },
};
