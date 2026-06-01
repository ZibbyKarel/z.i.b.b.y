import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { IconTile } from "./IconTile";

const meta: Meta<typeof IconTile> = {
  title: "DesignSystem/IconTile",
  component: IconTile,
  parameters: { backgrounds: { default: "velin" } },
  args: { glyph: "bot", size: "md", tone: "accent", radius: "sm" },
};
export default meta;

type Story = StoryObj<typeof IconTile>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          sizes
        </Typography>
        <div className="flex items-center gap-4">
          <IconTile glyph="bot" size="sm" />
          <IconTile glyph="bot" size="md" />
          <IconTile glyph="bot" size="lg" />
          <IconTile glyph="bot" radius="default" size="xl" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          tones
        </Typography>
        <div className="flex items-center gap-4">
          <IconTile glyph="spark" tone="accent" />
          <IconTile glyph="gear" tone="neutral" />
          <IconTile interactive as="button" glyph="edit" tone="neutral" />
        </div>
      </div>
    </div>
  ),
};
