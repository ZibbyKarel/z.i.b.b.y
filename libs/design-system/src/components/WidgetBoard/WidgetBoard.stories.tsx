import type { Meta, StoryObj } from "@storybook/react";
import { WidgetBoard } from "./WidgetBoard";

const meta: Meta<typeof WidgetBoard> = {
  title: "DesignSystem/WidgetBoard",
  component: WidgetBoard,
  parameters: { layout: "fullscreen" },
  args: { colWidth: 90, gap: 14, height: 300, editing: false },
};
export default meta;

type Story = StoryObj<typeof WidgetBoard>;

export const View: Story = {
  render: (args) => (
    <div className="flex h-[400px] flex-col">
      <WidgetBoard {...args} />
    </div>
  ),
};

export const Editing: Story = { ...View, args: { editing: true } };
