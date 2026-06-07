import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { TextInputField } from "./TextInputField";

const meta: Meta<typeof TextInputField> = {
  title: "DesignSystem/Field/TextInputField",
  component: TextInputField,
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

type Story = StoryObj<typeof TextInputField>;

export const Overview: Story = {
  render: () => {
    const [name, setName] = useState("rohlik");
    return (
      <div className="flex flex-col gap-6">
        <TextInputField
          label="Název skillu"
          onChange={(e) => setName(e.target.value)}
          value={name}
        />
        <TextInputField hint="Nápověda k poli" label="S nápovědou" placeholder="…" />
        <TextInputField
          error="Toto pole je povinné"
          label="S chybou"
          placeholder="…"
        />
      </div>
    );
  },
};

export const Playground: Story = {
  args: { label: "Název", hint: "Nápověda k poli", placeholder: "…" },
};
