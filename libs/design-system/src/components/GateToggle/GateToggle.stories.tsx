import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { GateToggle } from "./GateToggle";
import type { GateMode } from "./GateToggle";

const meta: Meta<typeof GateToggle> = {
  title: "DesignSystem/GateToggle",
  component: GateToggle,
  args: {},
};
export default meta;

type Story = StoryObj<typeof GateToggle>;

function Controlled() {
  const [mode, setMode] = useState<GateMode>("ask");
  return <GateToggle mode={mode} onChange={setMode} />;
}

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6 p-8">
      <Controlled />
      <GateToggle mode="auto" />
    </div>
  ),
};

export const Playground: Story = {
  render: () => <Controlled />,
};
