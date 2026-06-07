import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { SegmentPicker } from "./SegmentPicker";

const meta: Meta<typeof SegmentPicker> = {
  title: "DesignSystem/Field/SegmentPicker",
  component: SegmentPicker,
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

type Story = StoryObj<typeof SegmentPicker>;

const OPTIONS = [
  { value: "home", label: "home" },
  { value: "work", label: "work" },
];

export const Overview: Story = {
  render: () => {
    const [ctx, setCtx] = useState("home");
    return (
      <div className="flex flex-col gap-6">
        <SegmentPicker
          label="Kontext"
          onValueChange={setCtx}
          options={OPTIONS}
          value={ctx}
        />
        <SegmentPicker
          hint="Vyber jeden kontext"
          label="S nápovědou"
          onValueChange={() => {}}
          options={OPTIONS}
          value="home"
        />
      </div>
    );
  },
};

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = useState("home");
    return (
      <SegmentPicker
        {...args}
        onValueChange={setValue}
        options={OPTIONS}
        value={value}
      />
    );
  },
  args: { label: "Kontext" },
};
