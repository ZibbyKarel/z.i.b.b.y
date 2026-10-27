import type { Meta, StoryObj } from "@storybook/react";
import { WidgetBoard } from "./WidgetBoard";

const meta: Meta<typeof WidgetBoard> = {
  title: "DesignSystem/WidgetBoard",
  component: WidgetBoard,
  parameters: { layout: "fullscreen" },
  args: { colWidth: 90, gap: 14, height: 300, guides: false },
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

export const Guides: Story = { ...View, args: { guides: true } };
