import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { ButtonGroup } from "./ButtonGroup";
import type { ButtonGroupOption } from "./ButtonGroup";

const contextOptions: ButtonGroupOption[] = [
  {
    id: "home",
    label: "home",
    swatchClass: "bg-home",
    activeClass:
      "bg-home text-background shadow-[0_0_14px_rgba(240,180,41,0.33)]",
  },
  {
    id: "work",
    label: "work",
    swatchClass: "bg-work",
    activeClass:
      "bg-work text-background shadow-[0_0_14px_rgba(91,141,239,0.33)]",
  },
];

const meta: Meta<typeof ButtonGroup> = {
  title: "Components/ButtonGroup",
  component: ButtonGroup,
  parameters: { backgrounds: { default: "velin" } },
};
export default meta;

type Story = StoryObj<typeof ButtonGroup>;

export const Interactive: Story = {
  render: () => {
    const [value, setValue] = useState("home");
    return (
      <ButtonGroup
        options={contextOptions}
        value={value}
        onChange={setValue}
        ariaLabel="Přepínač kontextu"
      />
    );
  },
};

export const WithAddButton: Story = {
  render: () => {
    const [value, setValue] = useState("home");
    return (
      <ButtonGroup
        options={contextOptions}
        value={value}
        onChange={setValue}
        onAdd={() => {}}
        addLabel="Přidat kontext"
        ariaLabel="Přepínač kontextu"
      />
    );
  },
};
