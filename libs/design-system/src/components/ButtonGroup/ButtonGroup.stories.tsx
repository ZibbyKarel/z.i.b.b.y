import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { ButtonGroup, type ButtonGroupOption } from "./ButtonGroup";

const contextOptions: ButtonGroupOption[] = [
  { id: "home", label: "home", tone: "home" },
  { id: "work", label: "work", tone: "work" },
];

const meta: Meta<typeof ButtonGroup> = {
  title: "Components/ButtonGroup",
  component: ButtonGroup,
  parameters: { backgrounds: { default: "velin" } },
};
export default meta;

type Story = StoryObj<typeof ButtonGroup>;

export const Overview: Story = {
  render: () => {
    const [value, setValue] = useState("home");
    const [valueAdd, setValueAdd] = useState("home");
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Typography mono type="subtitle" variant="tertiary">
            default
          </Typography>
          <ButtonGroup
            ariaLabel="Přepínač kontextu"
            onChange={setValue}
            options={contextOptions}
            value={value}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Typography mono type="subtitle" variant="tertiary">
            with add button
          </Typography>
          <ButtonGroup
            addLabel="Přidat kontext"
            ariaLabel="Přepínač s tlačítkem přidat"
            onAdd={() => {}}
            onChange={setValueAdd}
            options={contextOptions}
            value={valueAdd}
          />
        </div>
      </div>
    );
  },
};

export const Playground: Story = {
  render: () => {
    const [value, setValue] = useState("home");
    return (
      <ButtonGroup
        ariaLabel="Přepínač kontextu"
        onChange={setValue}
        options={contextOptions}
        value={value}
      />
    );
  },
};
