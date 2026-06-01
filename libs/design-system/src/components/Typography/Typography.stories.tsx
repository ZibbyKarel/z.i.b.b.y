import type { Meta, StoryObj } from "@storybook/react";
import { Typography, type TypographyType, type TypographyVariant } from "./Typography";

const meta: Meta<typeof Typography> = {
  title: "Components/Typography",
  component: Typography,
  parameters: { backgrounds: { default: "velin" } },
  argTypes: {
    type: {
      control: "select",
      options: ["pageTitle", "title", "subtitle", "text", "note"],
    },
    variant: {
      control: "select",
      options: ["primary", "secondary", "tertiary"],
    },
  },
  args: { type: "title", variant: "primary", children: "Velín · přehled provozu" },
};
export default meta;

type Story = StoryObj<typeof Typography>;

const types: TypographyType[] = ["pageTitle", "title", "subtitle", "text", "note"];
const variants: TypographyVariant[] = ["primary", "secondary", "tertiary"];

/** Every semantic role, top to bottom. */
export const Scale: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {types.map((type) => (
        <Typography key={type} type={type}>
          {type} — Skoč na velín, kapitáne
        </Typography>
      ))}
    </div>
  ),
};

/** Each color variant across the scale. */
export const Variants: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      {variants.map((variant) => (
        <div key={variant} className="flex flex-col gap-1">
          {types.map((type) => (
            <Typography key={type} type={type} variant={variant}>
              {variant} · {type}
            </Typography>
          ))}
        </div>
      ))}
    </div>
  ),
};

export const Playground: Story = {};
