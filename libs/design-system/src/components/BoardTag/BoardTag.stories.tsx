import type { Meta, StoryObj } from "@storybook/react";
import { BoardTag } from "./BoardTag";

const meta: Meta<typeof BoardTag> = {
  title: "DesignSystem/BoardTag",
  component: BoardTag,
  parameters: { backgrounds: { default: "velin" } },
  argTypes: { variant: { control: "radio", options: ["you", "source"] } },
  args: { variant: "you", children: "YOU · 2H" },
};
export default meta;

type Story = StoryObj<typeof BoardTag>;

export const Overview: Story = {
  render: () => (
    <div className="flex gap-3">
      <BoardTag variant="you">YOU · 2H</BoardTag>
      <BoardTag variant="source">JIRA</BoardTag>
    </div>
  ),
};
export const Playground: Story = {};
