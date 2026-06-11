import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { Chip, type ChipTone } from "./Chip";

const meta: Meta<typeof Chip> = {
  title: "DesignSystem/Chip",
  component: Chip,
  parameters: { backgrounds: { default: "velin" } },
  argTypes: {
    tone: { control: "select", options: ["ok", "run", "wait", "bad", "idle", "accent"] },
    dot: { control: "boolean" },
    pulse: { control: "boolean" },
  },
  args: { children: "running", tone: "run", dot: true, pulse: true },
};
export default meta;

type Story = StoryObj<typeof Chip>;

const tones: ChipTone[] = ["ok", "run", "wait", "bad", "idle", "accent"];

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          tones
        </Typography>
        <div className="flex flex-wrap gap-2">
          {tones.map((tone) => (
            <Chip key={tone} tone={tone}>
              {tone}
            </Chip>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          with dot
        </Typography>
        <div className="flex flex-wrap gap-2">
          {tones.map((tone) => (
            <Chip dot key={tone} tone={tone}>
              {tone}
            </Chip>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          live (pulsing dot)
        </Typography>
        <div className="flex flex-wrap gap-2">
          <Chip dot pulse tone="run">
            running
          </Chip>
          <Chip dot pulse tone="wait">
            waiting for you
          </Chip>
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
