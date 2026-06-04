import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Typography } from "../Typography/Typography";
import { Switch } from "./Switch";

const meta: Meta<typeof Switch> = {
  title: "DesignSystem/Switch",
  component: Switch,
  args: { checked: true, label: "Caffeinate", size: "md", disabled: false },
  argTypes: {
    size: { control: "radio", options: ["sm", "md"] },
  },
};
export default meta;

type Story = StoryObj<typeof Switch>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          states
        </Typography>
        <div className="flex items-center gap-4">
          <Switch checked={false} label="off" onChange={() => {}} />
          <Switch checked label="on" onChange={() => {}} />
          <Switch disabled checked={false} label="disabled off" onChange={() => {}} />
          <Switch checked disabled label="disabled on" onChange={() => {}} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          sizes
        </Typography>
        <div className="flex items-center gap-4">
          <Switch checked label="sm" onChange={() => {}} size="sm" />
          <Switch checked label="md" onChange={() => {}} size="md" />
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {
  render: (args) => {
    const [on, setOn] = useState(args.checked);
    return <Switch {...args} checked={on} onChange={setOn} />;
  },
};
