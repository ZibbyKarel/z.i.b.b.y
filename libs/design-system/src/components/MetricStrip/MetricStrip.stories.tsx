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

const SIX: MetricStripItem[] = [
  { label: "Status", value: "Running" },
  { label: "Stage", value: "2/5" },
  { label: "Elapsed", value: "04:12" },
  { label: "Cost", value: "$0.42" },
  { label: "Tokens", value: "18.2k" },
  { label: "Files", value: "7" },
];

export const Overview: Story = {
  render: () => (
    <div className="flex max-w-4xl flex-col gap-8 p-8">
      <MetricStrip columns={3} items={THREE} />
      <MetricStrip columns={4} items={FOUR} />
      <MetricStrip columns={6} items={SIX} />
    </div>
  ),
};

export const Playground: Story = {
  args: { columns: 3, items: THREE },
};
