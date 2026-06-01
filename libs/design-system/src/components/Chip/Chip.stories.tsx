import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { Chip } from "./Chip";

const meta: Meta<typeof Chip> = {
  title: "DesignSystem/Chip",
  component: Chip,
  parameters: { backgrounds: { default: "velin" } },
  args: { children: "hotovo", tone: "ok" },
};
export default meta;

type Story = StoryObj<typeof Chip>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          tones
        </Typography>
        <div className="flex flex-wrap gap-2">
          <Chip tone="neutral">neutral</Chip>
          <Chip tone="accent">work</Chip>
          <Chip tone="ok">hotovo</Chip>
          <Chip tone="warn">zaparkováno</Chip>
          <Chip tone="bad">selhalo</Chip>
          <Chip tone="opus">opus</Chip>
          <Chip tone="sonnet">sonnet</Chip>
          <Chip tone="haiku">haiku</Chip>
          <Chip tone="think-high">◇ high</Chip>
          <Chip tone="think-medium">◇ medium</Chip>
          <Chip tone="think-low">◇ low</Chip>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          solid
        </Typography>
        <div className="flex flex-wrap gap-2">
          <Chip solid tone="accent">
            accent
          </Chip>
          <Chip solid tone="ok">
            ok
          </Chip>
          <Chip solid tone="warn">
            warn
          </Chip>
          <Chip solid tone="bad">
            bad
          </Chip>
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
