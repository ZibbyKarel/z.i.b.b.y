import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { ScreenGlow } from "./ScreenGlow";

const meta: Meta<typeof ScreenGlow> = {
  title: "DesignSystem/ScreenGlow",
  component: ScreenGlow,
  parameters: { layout: "fullscreen", backgrounds: { default: "velin" } },
};
export default meta;

type Story = StoryObj<typeof ScreenGlow>;

/** The glow hugs the viewport edge; content underneath stays clickable. */
export const Default: Story = {
  render: () => (
    <div className="flex h-screen items-center justify-center">
      <Typography type="label">Autopilot is on</Typography>
      <ScreenGlow />
    </div>
  ),
};
