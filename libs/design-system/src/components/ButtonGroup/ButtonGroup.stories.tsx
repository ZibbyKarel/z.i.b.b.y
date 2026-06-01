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
          <Typography type="subtitle" variant="tertiary" mono>
            default
          </Typography>
          <ButtonGroup
            options={contextOptions}
            value={value}
            onChange={setValue}
            ariaLabel="Přepínač kontextu"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Typography type="subtitle" variant="tertiary" mono>
            with add button
          </Typography>
          <ButtonGroup
            options={contextOptions}
            value={valueAdd}
            onChange={setValueAdd}
            onAdd={() => {}}
            addLabel="Přidat kontext"
            ariaLabel="Přepínač s tlačítkem přidat"
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
        options={contextOptions}
        value={value}
        onChange={setValue}
        ariaLabel="Přepínač kontextu"
      />
    );
  },
};
