import type { Meta, StoryObj } from "@storybook/react";
import { Icon } from "../Icon/Icon";
import { GraphIconButton } from "./GraphIconButton";

const meta: Meta<typeof GraphIconButton> = {
  title: "DesignSystem/Graph/GraphIconButton",
  component: GraphIconButton,
  parameters: { backgrounds: { default: "velin" } },
};
export default meta;

type Story = StoryObj<typeof GraphIconButton>;

export const Overview: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <GraphIconButton aria-label="Disconnect" onClick={() => {}}>
        <Icon name="x" size="xs" />
      </GraphIconButton>
      <GraphIconButton aria-label="Decrease" onClick={() => {}} variant="step">
        −
      </GraphIconButton>
      <GraphIconButton aria-label="Increase" onClick={() => {}} variant="step">
        +
      </GraphIconButton>
    </div>
  ),
};

export const Playground: Story = {
  argTypes: {
    variant: { control: "select", options: ["plain", "step"] },
  },
  args: {
    "aria-label": "Disconnect",
    children: "×",
    variant: "plain",
  },
};
