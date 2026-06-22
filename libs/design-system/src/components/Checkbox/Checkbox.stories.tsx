import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Typography } from "../Typography/Typography";
import { Checkbox } from "./Checkbox";

const meta: Meta<typeof Checkbox> = {
  title: "DesignSystem/Checkbox",
  component: Checkbox,
  args: { checked: true, label: "Notify me", size: "md", disabled: false },
  argTypes: {
    size: { control: "radio", options: ["sm", "md"] },
  },
};
export default meta;

type Story = StoryObj<typeof Checkbox>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          states
        </Typography>
        <div className="flex items-center gap-4">
          <Checkbox checked={false} label="off" onChange={() => {}} />
          <Checkbox checked label="on" onChange={() => {}} />
          <Checkbox disabled checked={false} label="disabled off" onChange={() => {}} />
          <Checkbox checked disabled label="disabled on" onChange={() => {}} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          sizes
        </Typography>
        <div className="flex items-center gap-4">
          <Checkbox checked label="sm" onChange={() => {}} size="sm" />
          <Checkbox checked label="md" onChange={() => {}} size="md" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          presentational (embedded, visual-only)
        </Typography>
        <div className="flex items-center gap-4">
          <Checkbox presentational checked={false} />
          <Checkbox checked presentational />
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {
  render: (args) => {
    const [on, setOn] = useState(args.checked);
    return <Checkbox {...args} checked={on} onChange={setOn} />;
  },
};
