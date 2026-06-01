import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import type { ContextName } from "../../DesignSystemContext/contextTokens";
import { ContextSwitch } from "./ContextSwitch";

const meta: Meta<typeof ContextSwitch> = {
  title: "Dashboard/ContextSwitch",
  component: ContextSwitch,
  parameters: { backgrounds: { default: "velin" } },
};
export default meta;

type Story = StoryObj<typeof ContextSwitch>;

export const Interactive: Story = {
  render: () => {
    const [ctx, setCtx] = useState<ContextName>("home");
    return <ContextSwitch context={ctx} onContextChange={setCtx} />;
  },
};
