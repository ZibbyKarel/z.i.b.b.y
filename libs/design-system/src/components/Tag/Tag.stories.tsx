import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { type RiskKind, Tag, type TagTone, riskIcon } from "./Tag";

const meta: Meta<typeof Tag> = {
  title: "DesignSystem/Tag",
  component: Tag,
  parameters: { backgrounds: { default: "velin" } },
  argTypes: {
    tone: {
      control: "select",
      options: ["neutral", "accent", "ok", "warn", "bad", "run", "payment", "deletion", "push", "send"],
    },
    size: { control: "radio", options: ["sm", "md"] },
    solid: { control: "boolean" },
  },
  args: { children: "hotovo", tone: "accent" },
};
export default meta;

type Story = StoryObj<typeof Tag>;

const tones: TagTone[] = ["neutral", "accent", "ok", "warn", "bad", "run"];
const risks: RiskKind[] = ["payment", "deletion", "push", "send"];

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          tones
        </Typography>
        <div className="flex flex-wrap gap-2">
          {tones.map((tone) => (
            <Tag key={tone} tone={tone}>
              {tone}
            </Tag>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          solid
        </Typography>
        <div className="flex flex-wrap gap-2">
          {tones.map((tone) => (
            <Tag solid key={tone} tone={tone}>
              {tone}
            </Tag>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          risk categories (icon + tone)
        </Typography>
        <div className="flex flex-wrap gap-2">
          {risks.map((risk) => (
            <Tag icon={riskIcon[risk]} key={risk} tone={risk}>
              {risk}
            </Tag>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          sizes
        </Typography>
        <div className="flex flex-wrap items-center gap-2">
          <Tag size="sm" tone="ok">
            sm
          </Tag>
          <Tag size="md" tone="ok">
            md
          </Tag>
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
