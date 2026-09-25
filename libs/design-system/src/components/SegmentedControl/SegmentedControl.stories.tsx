import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { SegmentedControl } from "./SegmentedControl";
import type { SegmentedControlItem } from "./SegmentedControl";

const meta: Meta<typeof SegmentedControl> = {
  title: "DesignSystem/SegmentedControl",
  component: SegmentedControl,
  args: {},
};
export default meta;

type Story = StoryObj<typeof SegmentedControl>;

const THEME_ITEMS: SegmentedControlItem[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const STATE_ITEMS: SegmentedControlItem[] = [
  { value: "all", label: "All" },
  { value: "working", label: "Working", dot: "working" },
  { value: "blocked", label: "Blocked", dot: "blocked" },
  { value: "error", label: "Error", dot: "error" },
];

function Controlled({ items, size }: { items: SegmentedControlItem[]; size?: "sm" | "md" }) {
  const [value, setValue] = useState(items[0]?.value ?? "");
  return (
    <SegmentedControl
      ariaLabel="Demo"
      items={items}
      onChange={setValue}
      size={size}
      value={value}
    />
  );
}

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6 p-8">
      <Controlled items={THEME_ITEMS} />
      <Controlled items={STATE_ITEMS} />
      <Controlled items={STATE_ITEMS} size="sm" />
    </div>
  ),
};

export const Playground: Story = {
  render: () => <Controlled items={STATE_ITEMS} />,
};
