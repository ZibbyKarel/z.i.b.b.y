import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { HoldButton } from "./HoldButton";

const meta: Meta<typeof HoldButton> = {
  title: "DesignSystem/HoldButton",
  component: HoldButton,
  parameters: { backgrounds: { default: "velin" } },
  argTypes: {
    tone: { control: "select", options: ["warn", "bad", "ok", "accent"] },
  },
  args: {
    label: "Podržet pro schválení",
    doneLabel: "Schváleno",
    tone: "warn",
  },
};
export default meta;

type Story = StoryObj<typeof HoldButton>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Typography type="label">tones</Typography>
        <div className="flex flex-wrap gap-3">
          <HoldButton doneLabel="Schváleno" label="Podržet pro schválení" tone="warn" />
          <HoldButton doneLabel="Smazáno" label="Podržet pro smazání" tone="bad" />
          <HoldButton doneLabel="Potvrzeno" label="Podržet pro potvrzení" tone="accent" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="label">disabled</Typography>
        <div className="flex flex-wrap gap-3">
          <HoldButton disabled label="Podržet pro schválení" />
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
