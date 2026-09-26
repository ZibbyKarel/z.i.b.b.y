import type { Meta, StoryObj } from "@storybook/react";
import { FilterBar } from "./FilterBar";

const meta: Meta<typeof FilterBar> = {
  title: "DesignSystem/FilterBar",
  component: FilterBar,
  args: {},
};
export default meta;

type Story = StoryObj<typeof FilterBar>;

function FilterGroup({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] tracking-wider text-foreground-faint uppercase">
        {label}
      </span>
      <select className="h-8 border border-border-strong bg-background px-2 text-sm">
        <option>{value}</option>
      </select>
    </div>
  );
}

export const Overview: Story = {
  render: () => (
    <div className="max-w-3xl p-8">
      <FilterBar actions={<button type="button">New task</button>} onClear={() => {}}>
        <FilterGroup label="Company" value="All" />
        <FilterGroup label="Project" value="All" />
        <FilterGroup label="Department" value="All" />
      </FilterBar>
    </div>
  ),
};

export const Playground: Story = {
  args: {
    children: <FilterGroup label="Company" value="All" />,
  },
};
