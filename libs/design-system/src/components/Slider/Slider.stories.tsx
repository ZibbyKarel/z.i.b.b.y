import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Slider } from "./Slider";

const meta: Meta<typeof Slider> = {
  title: "DesignSystem/Slider",
  component: Slider,
  args: {},
};
export default meta;

type Story = StoryObj<typeof Slider>;

function Controlled() {
  const [value, setValue] = useState(80);
  return (
    <Slider
      caption="Runs pause here until you raise the cap."
      format={(v) => `${v}%`}
      label="Warn threshold"
      max={100}
      min={50}
      onChange={setValue}
      value={value}
    />
  );
}

export const Overview: Story = {
  render: () => (
    <div className="flex max-w-sm flex-col gap-8 p-8">
      <Controlled />
      <Slider
        disabled
        label="Stop threshold (locked)"
        max={100}
        min={50}
        onChange={() => {}}
        value={95}
      />
    </div>
  ),
};

export const Playground: Story = {
  render: () => <Controlled />,
};
