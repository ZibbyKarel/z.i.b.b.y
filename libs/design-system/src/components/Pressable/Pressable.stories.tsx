import type { Meta, StoryObj } from "@storybook/react";
import { Tag } from "../Tag/Tag";
import { Pressable } from "./Pressable";

const meta: Meta<typeof Pressable> = {
  title: "DesignSystem/Pressable",
  component: Pressable,
  parameters: { backgrounds: { default: "velin" } },
};
export default meta;

type Story = StoryObj<typeof Pressable>;

export const WrappingABadge: Story = {
  render: () => (
    <Pressable aria-label="Změnit model" onClick={() => {}}>
      <Tag tone="accent">opus</Tag>
    </Pressable>
  ),
};
