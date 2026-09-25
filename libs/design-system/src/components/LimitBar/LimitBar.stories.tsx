import type { Meta, StoryObj } from "@storybook/react";
import { Row } from "../Stack/Stack";
import { LimitBar } from "./LimitBar";

const meta: Meta<typeof LimitBar> = {
  title: "DesignSystem/LimitBar",
  component: LimitBar,
  args: {},
};
export default meta;

type Story = StoryObj<typeof LimitBar>;

export const Overview: Story = {
  render: () => (
    <div className="p-8">
      <Row gap="300">
        <LimitBar label="5H" max={100} value={64} />
        <LimitBar label="WEEK" max={100} value={22} />
        <LimitBar label="5H" max={100} value={91} />
      </Row>
    </div>
  ),
};

export const Playground: Story = {
  args: { label: "5H", max: 100, value: 64 },
};
