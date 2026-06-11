import type { Meta, StoryObj } from "@storybook/react";
import {
  Typography,
  type TypographyType,
  type TypographyVariant,
} from "./Typography";

const meta: Meta<typeof Typography> = {
  title: "DesignSystem/Typography",
  component: Typography,
  parameters: { backgrounds: { default: "velin" } },
  argTypes: {
    type: {
      control: "select",
      options: [
        "pageTitle",
        "title",
        "subtitle",
        "text",
        "note",
        "num",
        "data",
        "label",
        "micro",
      ],
    },
    variant: {
      control: "select",
      options: ["primary", "secondary", "tertiary"],
    },
  },
  args: {
    type: "title",
    variant: "primary",
    children: "Velín · přehled provozu",
  },
};
export default meta;

type Story = StoryObj<typeof Typography>;

const types: TypographyType[] = [
  "pageTitle",
  "title",
  "subtitle",
  "text",
  "note",
  "num",
  "data",
  "label",
  "micro",
];
const variants: TypographyVariant[] = ["primary", "secondary", "tertiary"];

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          type scale
        </Typography>
        <div className="flex flex-col gap-3">
          {types.map((type) => (
            <Typography key={type} type={type}>
              {type} — Skoč na velín, kapitáne
            </Typography>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          variants (primary / secondary / tertiary)
        </Typography>
        <div className="flex flex-col gap-6">
          {variants.map((variant) => (
            <div className="flex flex-col gap-1" key={variant}>
              {types.map((type) => (
                <Typography key={type} type={type} variant={variant}>
                  {variant} · {type}
                </Typography>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
