import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { Chip, type ChipTone } from "./Chip";

const meta: Meta<typeof Chip> = {
  title: "DesignSystem/Chip",
  component: Chip,
  parameters: { backgrounds: { default: "velin" } },
  args: { children: "hotovo", tone: "ok" },
};
export default meta;

type Story = StoryObj<typeof Chip>;

const tones: ChipTone[] = ["neutral", "accent", "ok", "warn", "bad", "run"];

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
          solid
        </Typography>
        <div className="flex flex-wrap gap-2">
          {tones.map((tone) => (
            <Chip solid key={tone} tone={tone}>
              {tone}
            </Chip>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          sizes
        </Typography>
        <div className="flex flex-wrap items-center gap-2">
          <Chip size="sm" tone="ok">
            sm
          </Chip>
          <Chip size="md" tone="ok">
            md
          </Chip>
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
