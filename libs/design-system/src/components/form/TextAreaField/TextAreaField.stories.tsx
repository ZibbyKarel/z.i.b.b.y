import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { TextAreaField } from "./TextAreaField";

const meta: Meta<typeof TextAreaField> = {
  title: "DesignSystem/Field/TextAreaField",
  component: TextAreaField,
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

type Story = StoryObj<typeof TextAreaField>;

export const Overview: Story = {
  render: () => {
    const [desc, setDesc] = useState("");
    return (
      <div className="flex flex-col gap-6">
        <TextAreaField
          hint="z description v SKILL.md"
          label="Popis"
          onChange={(e) => setDesc(e.target.value)}
          value={desc}
        />
        <TextAreaField error="Popis nesmí být prázdný" label="S chybou" />
      </div>
    );
  },
};

export const Playground: Story = {
  args: { label: "Popis", hint: "z description v SKILL.md", placeholder: "…" },
};
