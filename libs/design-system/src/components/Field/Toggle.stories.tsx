import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Toggle } from "./Toggle";

const meta: Meta<typeof Toggle> = {
  title: "DesignSystem/Field/Toggle",
  component: Toggle,
  parameters: { backgrounds: { default: "velin" } },
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof Toggle>;

export const Overview: Story = {
  render: () => {
    const [a, setA] = useState(true);
    const [b, setB] = useState(false);
    return (
      <div className="flex flex-col gap-6">
        <Toggle checked={a} label="Auto-run" onChange={setA} />
        <Toggle
          checked={b}
          hint="Spustí se hned po uložení"
          label="S nápovědou"
          onChange={setB}
        />
        <Toggle disabled checked={false} label="Zakázáno" onChange={() => {}} />
      </div>
    );
  },
};

export const Playground: Story = {
  render: (args) => {
    const [checked, setChecked] = useState(args.checked ?? false);
    return <Toggle {...args} checked={checked} onChange={setChecked} />;
  },
  args: { label: "Auto-run", hint: "Spustí se po uložení" },
};
