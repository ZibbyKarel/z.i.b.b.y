import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { TextArea } from "./TextArea";

const meta: Meta<typeof TextArea> = {
  title: "DesignSystem/Field/TextArea",
  component: TextArea,
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

type Story = StoryObj<typeof TextArea>;

export const Overview: Story = {
  render: () => {
    const [desc, setDesc] = useState("");
    return (
      <div className="flex flex-col gap-6">
        <TextArea
          hint="z description v SKILL.md"
          label="Popis"
          onChange={(e) => setDesc(e.target.value)}
          value={desc}
        />
        <TextArea error="Popis nesmí být prázdný" label="S chybou" />
      </div>
    );
  },
};

export const Playground: Story = {
  args: { label: "Popis", hint: "z description v SKILL.md", placeholder: "…" },
};
