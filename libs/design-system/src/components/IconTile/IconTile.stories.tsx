import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { IconTile } from "./IconTile";

const meta: Meta<typeof IconTile> = {
  title: "Components/IconTile",
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
        <Typography type="subtitle" variant="tertiary" mono>
          sizes
        </Typography>
        <div className="flex items-center gap-4">
          <IconTile glyph="bot" size="sm" />
          <IconTile glyph="bot" size="md" />
          <IconTile glyph="bot" size="lg" />
          <IconTile glyph="bot" size="xl" radius="default" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="subtitle" variant="tertiary" mono>
          tones
        </Typography>
        <div className="flex items-center gap-4">
          <IconTile glyph="spark" tone="accent" />
          <IconTile glyph="gear" tone="neutral" />
          <IconTile glyph="edit" tone="neutral" interactive as="button" />
        </div>
      </div>
    </div>
  ),
};
