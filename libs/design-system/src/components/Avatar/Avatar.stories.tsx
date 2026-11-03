import type { Meta, StoryObj } from "@storybook/react";
import { Avatar } from "./Avatar";

const meta: Meta<typeof Avatar> = {
  title: "DesignSystem/Avatar",
  component: Avatar,
  parameters: { backgrounds: { default: "velin" } },
  args: { name: "alice", size: "sm" },
};
export default meta;

type Story = StoryObj<typeof Avatar>;

export const Playground: Story = {};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Avatar name="alice" size="sm" />
      <Avatar name="alice" size="md" />
    </div>
  ),
};
