import type { Meta, StoryObj } from "@storybook/react";
import { WidgetFrame } from "./WidgetFrame";

const meta: Meta<typeof WidgetFrame> = {
  title: "DesignSystem/WidgetFrame",
  component: WidgetFrame,
  parameters: { backgrounds: { default: "velin" } },
  args: {
    label: "ISSUES",
    count: "07",
    you: "02 YOU",
    style: { left: 16, top: 16, width: 360, height: 220 },
    onToggleCollapse: () => {},
    onRemove: () => {},
    children: <div className="p-4 text-[13px]">Rows go here</div>,
  },
  decorators: [(Story) => <div className="relative h-[260px]">{Story()}</div>],
};
export default meta;

type Story = StoryObj<typeof WidgetFrame>;

export const View: Story = {};
export const Collapsed: Story = { args: { collapsed: true } };
export const EmptyAllClear: Story = { args: { empty: true, aside: "ALL CLEAR" } };
export const Configurable: Story = { args: { onConfigure: () => {}, onRemove: () => {} } };
export const Configuring: Story = { args: { ...Configurable.args, configuring: true } };
export const Dragging: Story = { args: { dragging: true, sizeLabel: "4 × 6" } };
