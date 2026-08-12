import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { IconTile } from "./IconTile";

// A tiny valid 1x1 transparent PNG — stands in for an uploaded project logo.
const PLACEHOLDER_LOGO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const meta: Meta<typeof IconTile> = {
  title: "DesignSystem/IconTile",
  component: IconTile,
  parameters: { backgrounds: { default: "velin" } },
  argTypes: {
    size: { control: "select", options: ["sm", "md", "lg", "xl"] },
    tone: { control: "select", options: ["accent", "neutral"] },
    radius: { control: "select", options: ["sm", "default"] },
    shape: { control: "select", options: ["square", "circle"] },
    as: { control: "select", options: ["span", "div", "button"] },
  },
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
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          image (with glyph fallback)
        </Typography>
        <div className="flex items-center gap-4">
          <IconTile alt="Project logo" glyph="code" size="xl" src={PLACEHOLDER_LOGO} />
          <IconTile alt="Broken logo" glyph="code" size="xl" src="data:image/png;base64,broken" />
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
