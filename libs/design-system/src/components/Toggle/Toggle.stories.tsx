import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Typography } from "../Typography/Typography";
import { Toggle } from "./Toggle";

const meta: Meta<typeof Toggle> = {
  title: "DesignSystem/Toggle",
  component: Toggle,
  args: { checked: true, label: "Caffeinate", size: "md", disabled: false },
  argTypes: {
    size: { control: "radio", options: ["sm", "md"] },
  },
};
export default meta;

type Story = StoryObj<typeof Toggle>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          states
        </Typography>
        <div className="flex items-center gap-4">
          <Toggle checked={false} label="off" onChange={() => {}} />
          <Toggle checked label="on" onChange={() => {}} />
          <Toggle disabled checked={false} label="disabled off" onChange={() => {}} />
          <Toggle checked disabled label="disabled on" onChange={() => {}} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          sizes
        </Typography>
        <div className="flex items-center gap-4">
          <Toggle checked label="sm" onChange={() => {}} size="sm" />
          <Toggle checked label="md" onChange={() => {}} size="md" />
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {
  render: (args) => {
    const [on, setOn] = useState(args.checked);
    return <Toggle {...args} checked={on} onChange={setOn} />;
  },
};
