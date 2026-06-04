import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Select } from "./Select";

const meta: Meta<typeof Select> = {
  title: "DesignSystem/Field/Select",
  component: Select,
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

type Story = StoryObj<typeof Select>;

const OPTIONS = [
  { value: "opus", label: "opus" },
  { value: "sonnet", label: "sonnet" },
  { value: "haiku", label: "haiku" },
];

export const Overview: Story = {
  render: () => {
    const [model, setModel] = useState("opus");
    return (
      <div className="flex flex-col gap-6">
        <Select label="Model" onValueChange={setModel} options={OPTIONS} value={model} />
        <Select
          error="Vyber model"
          label="S chybou"
          onValueChange={() => {}}
          options={OPTIONS}
          value="opus"
        />
      </div>
    );
  },
};

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = useState("opus");
    return <Select {...args} onValueChange={setValue} options={OPTIONS} value={value} />;
  },
  args: { label: "Model", hint: "Vyber jazykový model" },
};
