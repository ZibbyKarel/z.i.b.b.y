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
          <Typography mono type="subtitle" variant="tertiary">
            TextField
          </Typography>
          <TextField
            label="Název skillu"
            onChange={(e) => setName(e.target.value)}
            value={name}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Typography mono type="subtitle" variant="tertiary">
            TextAreaField
          </Typography>
          <TextAreaField
            hint="z description v SKILL.md"
            label="Popis"
            onChange={(e) => setDesc(e.target.value)}
            value={desc}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Typography mono type="subtitle" variant="tertiary">
            SelectField
          </Typography>
          <SelectField
            label="Model"
            onValueChange={setModel}
            options={[
              { value: "opus", label: "opus" },
              { value: "sonnet", label: "sonnet" },
              { value: "haiku", label: "haiku" },
            ]}
            value={model}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Typography mono type="subtitle" variant="tertiary">
            SegmentedField
          </Typography>
          <SegmentedField
            label="Kontext"
            onValueChange={setCtx}
            options={[
              { value: "home", label: "home" },
              { value: "work", label: "work" },
            ]}
            value={ctx}
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
        hint="Nápověda k poli"
        label="Název"
        onChange={(e) => setValue(e.target.value)}
        value={value}
      />
    );
  },
};
