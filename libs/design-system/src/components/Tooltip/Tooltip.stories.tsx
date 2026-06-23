import type { Meta, StoryObj } from "@storybook/react";
import { Tooltip } from "./Tooltip";
import { Button } from "../Button/Button";

const meta: Meta<typeof Tooltip> = {
  title: "DesignSystem/Tooltip",
  component: Tooltip,
  parameters: { backgrounds: { default: "velin" } },
  args: {
    content: "A short hint shown on hover or focus.",
  },
};
export default meta;

type Story = StoryObj<typeof Tooltip>;

export const Overview: Story = {
  render: () => (
    <div className="flex gap-8 p-12">
      <Tooltip content="Appears above the trigger (default).">
        <Button aria-label="Help" icon="help" intent="ghost" size="sm" />
      </Tooltip>
      <Tooltip content="Appears below the trigger." side="bottom">
        <Button aria-label="Help" icon="help" intent="ghost" size="sm" />
      </Tooltip>
    </div>
  ),
};

export const Playground: Story = {
  render: (args) => (
    <div className="p-12">
      <Tooltip {...args}>
        <Button aria-label="Help" icon="help" intent="ghost" size="sm" />
      </Tooltip>
    </div>
  ),
};
