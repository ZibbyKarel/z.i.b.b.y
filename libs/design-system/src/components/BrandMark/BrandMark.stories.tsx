import type { Meta, StoryObj } from "@storybook/react";
import { BrandMark } from "./BrandMark";

const meta: Meta<typeof BrandMark> = {
  title: "DesignSystem/BrandMark",
  component: BrandMark,
};
export default meta;

type Story = StoryObj<typeof BrandMark>;

export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-6">
      <BrandMark size={16} />
      <BrandMark size={24} />
      <BrandMark size={30} />
      <BrandMark size={64} />
    </div>
  ),
};

export const Playground: Story = { args: { size: 30, label: "ZibbyCorp" } };
