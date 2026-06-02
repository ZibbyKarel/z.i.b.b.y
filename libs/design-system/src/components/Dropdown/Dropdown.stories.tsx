import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Dropdown } from "./Dropdown";

const LANG_OPTIONS = [
  { value: "cs", label: "Čeština", code: "CZ" },
  { value: "en", label: "English", code: "EN" },
];

const meta: Meta<typeof Dropdown> = {
  title: "DesignSystem/Dropdown",
  component: Dropdown,
  parameters: { backgrounds: { default: "velin" } },
};
export default meta;

type Story = StoryObj<typeof Dropdown>;

export const Languages: Story = {
  render: () => {
    const [value, setValue] = useState("cs");
    return (
      <div className="flex justify-end p-4">
        <Dropdown
          aria-label="Jazyk rozhraní"
          onChange={setValue}
          options={LANG_OPTIONS}
          value={value}
        />
      </div>
    );
  },
};

export const WithoutCodes: Story = {
  render: () => {
    const [value, setValue] = useState("a");
    return (
      <div className="flex justify-end p-4">
        <Dropdown
          onChange={setValue}
          options={[
            { value: "a", label: "Option Alpha" },
            { value: "b", label: "Option Beta" },
            { value: "c", label: "Option Gamma" },
          ]}
          value={value}
        />
      </div>
    );
  },
};
