import type { Meta, StoryObj } from "@storybook/react";
import { STATE_TONES } from "../../stateTone";
import { Typography } from "../Typography/Typography";
import { LivingGlow } from "./LivingGlow";

const meta: Meta<typeof LivingGlow> = {
  title: "DesignSystem/LivingGlow",
  component: LivingGlow,
  parameters: { backgrounds: { default: "velin" } },
  args: { tone: "accent", intensity: "idle" },
};
export default meta;

type Story = StoryObj<typeof LivingGlow>;

/** Each swatch is a positioned host box; the LivingGlow fills it and casts its glow. */
function Swatch({
  tone,
  intensity,
}: {
  tone: (typeof STATE_TONES)[number];
  intensity: "idle" | "hot";
}) {
  return (
    <div className="relative h-16 w-16 rounded-lg border border-border bg-surface">
      <LivingGlow intensity={intensity} tone={tone} />
    </div>
  );
}

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-8 p-12">
      <div className="flex flex-col gap-3">
        <Typography type="label">idle — ambient pulse, one per tone</Typography>
        <div className="flex items-center gap-8">
          {STATE_TONES.map((tone) => (
            <Swatch intensity="idle" key={tone} tone={tone} />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Typography type="label">hot — energized, in-flight pulse</Typography>
        <div className="flex items-center gap-8">
          {STATE_TONES.map((tone) => (
            <Swatch intensity="hot" key={tone} tone={tone} />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Typography type="label">breathe — free-standing orb glow</Typography>
        <div className="relative h-24 w-24 rounded-full border border-accent/40">
          <LivingGlow breathe intensity="hot" radius="full" tone="run" />
        </div>
      </div>
    </div>
  ),
};
