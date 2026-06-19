import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { NumberField } from "./NumberField";

const meta: Meta<typeof NumberField> = {
  title: "DesignSystem/Field/NumberField",
  component: NumberField,
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

type Story = StoryObj<typeof NumberField>;

export const Overview: Story = {
  render: () => {
    const [tick, setTick] = useState<number | null>(30000);
    return (
      <div className="flex flex-col gap-6">
        <NumberField
          hint="0 = disabled"
          label="Task tick (ms)"
          min={0}
          onValueChange={setTick}
          step={1000}
          value={tick}
        />
        <NumberField hint="Auto-resume cycles" label="With hint" min={1} value={3} />
        <NumberField error="Musí být kladné" label="With error" value={-1} />
      </div>
    );
  },
};

export const Playground: Story = {
  args: { label: "Tick (ms)", hint: "0 = disabled", value: 30000, min: 0 },
};
