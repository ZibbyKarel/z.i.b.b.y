import type { Meta, StoryObj } from "@storybook/react";
import { StackCrumbs } from "./StackCrumbs";

const meta: Meta<typeof StackCrumbs> = {
  title: "DesignSystem/StackCrumbs",
  component: StackCrumbs,
  args: {
    label: "STACK",
    crumbs: [
      { id: "1", label: "#212", tone: "done" },
      { id: "2", label: "#214", tone: "blocked", current: true },
      { id: "3", label: "#215", tone: "idle" },
    ],
  },
};
export default meta;
type Story = StoryObj<typeof StackCrumbs>;

export const Overview: Story = {
  render: (args) => (
    <div className="pb-3">
      <StackCrumbs {...args} />
    </div>
  ),
};
export const Playground: Story = {};
