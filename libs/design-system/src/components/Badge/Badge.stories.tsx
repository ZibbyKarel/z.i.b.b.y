import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { Badge, type BadgeTone } from "./Badge";

const meta: Meta<typeof Badge> = {
  title: "Components/Badge",
  component: Badge,
  parameters: { backgrounds: { default: "velin" } },
  args: { children: "neutral", tone: "neutral" },
};
export default meta;

type Story = StoryObj<typeof Badge>;

const tones: BadgeTone[] = [
  "neutral",
  "accent",
  "ok",
  "warn",
  "bad",
  "run",
  "opus",
  "sonnet",
  "haiku",
];

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Typography type="subtitle" variant="tertiary" mono>
          tones
        </Typography>
        <div className="flex flex-wrap gap-2">
          {tones.map((tone) => (
            <Badge key={tone} tone={tone}>
              {tone}
            </Badge>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="subtitle" variant="tertiary" mono>
          solid
        </Typography>
        <div className="flex flex-wrap gap-2">
          {tones.map((tone) => (
            <Badge key={tone} tone={tone} solid>
              {tone}
            </Badge>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="subtitle" variant="tertiary" mono>
          sizes
        </Typography>
        <div className="flex items-center gap-3">
          <Badge size="sm">sm</Badge>
          <Badge size="md">md</Badge>
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
