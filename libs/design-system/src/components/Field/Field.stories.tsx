import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { SegmentedField, SelectField, TextAreaField, TextField } from "./Field";

const meta: Meta = {
  title: "Components/Field",
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

type Story = StoryObj;

export const Overview: Story = {
  render: () => {
    const [name, setName] = useState("rohlik");
    const [desc, setDesc] = useState("");
    const [model, setModel] = useState("opus");
    const [ctx, setCtx] = useState("home");
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Typography type="subtitle" variant="tertiary" mono>
            TextField
          </Typography>
          <TextField
            label="Název skillu"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Typography type="subtitle" variant="tertiary" mono>
            TextAreaField
          </Typography>
          <TextAreaField
            label="Popis"
            hint="z description v SKILL.md"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Typography type="subtitle" variant="tertiary" mono>
            SelectField
          </Typography>
          <SelectField
            label="Model"
            value={model}
            onValueChange={setModel}
            options={[
              { value: "opus", label: "opus" },
              { value: "sonnet", label: "sonnet" },
              { value: "haiku", label: "haiku" },
            ]}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Typography type="subtitle" variant="tertiary" mono>
            SegmentedField
          </Typography>
          <SegmentedField
            label="Kontext"
            value={ctx}
            onValueChange={setCtx}
            options={[
              { value: "home", label: "home" },
              { value: "work", label: "work" },
            ]}
          />
        </div>
      </div>
    );
  },
};

export const Playground: Story = {
  render: () => {
    const [value, setValue] = useState("");
    return (
      <TextField
        label="Název"
        hint="Nápověda k poli"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    );
  },
};
