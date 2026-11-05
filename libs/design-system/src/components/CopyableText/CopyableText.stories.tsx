import type { Meta, StoryObj } from "@storybook/react";
import { CopyableText } from "./CopyableText";

const meta: Meta<typeof CopyableText> = {
  title: "DesignSystem/CopyableText",
  component: CopyableText,
  args: { text: "delivery_42", copyLabel: "Copy" },
};
export default meta;

type Story = StoryObj<typeof CopyableText>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-4 p-8">
      <CopyableText text="delivery_42" />
      <CopyableText copyLabel="Copy issue key" text="ZIB-123" />
      <CopyableText mono={false} text="Plain text" />
    </div>
  ),
};

export const Playground: Story = {};
