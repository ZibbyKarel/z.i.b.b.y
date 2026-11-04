import type { Meta, StoryObj } from "@storybook/react";
import { IconBadge } from "./IconBadge";

const meta: Meta<typeof IconBadge> = {
  title: "DesignSystem/IconBadge",
  component: IconBadge,
  args: { icon: "chat", count: 3, label: "3 unresolved" },
};
export default meta;

type Story = StoryObj<typeof IconBadge>;

export const Overview: Story = {
  render: () => (
    <div className="flex items-center gap-6 p-4">
      <IconBadge count={1} icon="chat" label="1 unresolved" />
      <IconBadge count={12} icon="chat" label="12 unresolved" />
      <IconBadge count={120} icon="chat" label="120 unresolved" />
    </div>
  ),
};

export const Playground: Story = {};
