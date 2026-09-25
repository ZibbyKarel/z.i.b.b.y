import type { Meta, StoryObj } from "@storybook/react";
import { MetricStrip } from "./MetricStrip";
import type { MetricStripItem } from "./MetricStrip";

const meta: Meta<typeof MetricStrip> = {
  title: "DesignSystem/MetricStrip",
  component: MetricStrip,
  args: {},
};
export default meta;

type Story = StoryObj<typeof MetricStrip>;

const THREE: MetricStripItem[] = [
  { label: "Runs", value: "128" },
  { label: "Avg cost", value: "$0.34" },
  { label: "Success", value: "97%" },
];

const FOUR: MetricStripItem[] = [
  { label: "Projects", value: "04" },
  { label: "Open tasks", value: "12", hint: "3 blocked" },
  { label: "Spend today", value: "$18.40" },
  { label: "Contacts", value: "06" },
];

export const Overview: Story = {
  render: () => (
    <div className="flex max-w-2xl flex-col gap-8 p-8">
      <MetricStrip columns={3} items={THREE} />
      <MetricStrip columns={4} items={FOUR} />
    </div>
  ),
};

export const Playground: Story = {
  args: { columns: 3, items: THREE },
};
