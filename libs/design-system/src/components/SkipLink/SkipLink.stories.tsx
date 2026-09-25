import type { Meta, StoryObj } from "@storybook/react";
import { SkipLink } from "./SkipLink";

const meta: Meta<typeof SkipLink> = {
  title: "DesignSystem/SkipLink",
  component: SkipLink,
  parameters: { backgrounds: { default: "velin" } },
};
export default meta;

type Story = StoryObj<typeof SkipLink>;

export const Overview: Story = {
  render: () => (
    <div className="text-foreground-dim text-[13px]">
      Tab to reveal the skip link — invisible until it receives keyboard focus.
      <SkipLink targetId="main-content" />
    </div>
  ),
};

export const Playground: Story = {
  args: { targetId: "main-content" },
};
