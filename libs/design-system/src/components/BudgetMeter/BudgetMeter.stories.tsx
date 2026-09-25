import type { Meta, StoryObj } from "@storybook/react";
import { BudgetMeter } from "./BudgetMeter";

const meta: Meta<typeof BudgetMeter> = {
  title: "DesignSystem/BudgetMeter",
  component: BudgetMeter,
  args: {},
};
export default meta;

type Story = StoryObj<typeof BudgetMeter>;

export const Overview: Story = {
  render: () => (
    <div className="grid max-w-3xl grid-cols-3 gap-3 p-8">
      <BudgetMeter caption="12 of 40 runs used" label="Daily cap" max={40} value={12} />
      <BudgetMeter caption="Approaching warn threshold" label="Weekly cap" max={200} value={150} />
      <BudgetMeter
        caption="Raising the cap still goes through Needs you."
        label="5H · SDK credit"
        max={100}
        stopAt={95}
        value={68}
        warnAt={80}
      />
    </div>
  ),
};

export const Playground: Story = {
  args: { label: "Daily cap", max: 100, value: 42, warnAt: 80, stopAt: 95 },
};
