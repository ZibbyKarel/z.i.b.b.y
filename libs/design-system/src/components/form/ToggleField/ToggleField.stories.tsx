import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ToggleField } from "./ToggleField";

const meta: Meta<typeof ToggleField> = {
  title: "DesignSystem/Field/ToggleField",
  component: ToggleField,
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

type Story = StoryObj<typeof ToggleField>;

export const Overview: Story = {
  render: () => {
    const [a, setA] = useState(true);
    const [b, setB] = useState(false);
    return (
      <div className="flex flex-col gap-6">
        <ToggleField checked={a} label="Auto-run" onChange={setA} />
        <ToggleField
          checked={b}
          hint="Spustí se hned po uložení"
          label="S nápovědou"
          onChange={setB}
        />
        <ToggleField disabled checked={false} label="Zakázáno" onChange={() => {}} />
      </div>
    );
  },
};

export const Playground: Story = {
  render: (args) => {
    const [checked, setChecked] = useState(args.checked ?? false);
    return <ToggleField {...args} checked={checked} onChange={setChecked} />;
  },
  args: { label: "Auto-run", hint: "Spustí se po uložení" },
};
