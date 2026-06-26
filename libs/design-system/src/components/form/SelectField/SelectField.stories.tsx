import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { SelectField } from "./SelectField";

const meta: Meta<typeof SelectField> = {
  title: "DesignSystem/Field/SelectField",
  component: SelectField,
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

type Story = StoryObj<typeof SelectField>;

const OPTIONS = [
  { value: "opus", label: "opus" },
  { value: "sonnet", label: "sonnet" },
  { value: "haiku", label: "haiku" },
];

export const Overview: Story = {
  render: () => {
    const [model, setModel] = useState("opus");
    const [models, setModels] = useState<string[]>(["opus", "haiku"]);
    return (
      <div className="flex flex-col gap-6">
        <SelectField label="Model" onValueChange={setModel} options={OPTIONS} value={model} />
        <SelectField
          error="Vyber model"
          label="S chybou"
          onValueChange={() => {}}
          options={OPTIONS}
          value="opus"
        />
        <SelectField
          multi
          hint="Vyber jeden či více"
          label="Modely (multi)"
          onValueChange={setModels}
          options={OPTIONS}
          placeholder="Vyber modely…"
          value={models}
        />
      </div>
    );
  },
};

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = useState("opus");
    return (
      <SelectField {...args} multi={false} onValueChange={setValue} options={OPTIONS} value={value} />
    );
  },
  args: { label: "Model", hint: "Vyber jazykový model" },
};
