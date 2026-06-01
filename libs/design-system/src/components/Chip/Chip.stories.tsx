import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { Chip } from "./Chip";

const meta: Meta<typeof Chip> = {
  title: "Components/Chip",
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
        <Typography type="subtitle" variant="tertiary" mono>
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
        <Typography type="subtitle" variant="tertiary" mono>
          solid
        </Typography>
        <div className="flex flex-wrap gap-2">
          <Chip tone="accent" solid>
            accent
          </Chip>
          <Chip tone="ok" solid>
            ok
          </Chip>
          <Chip tone="warn" solid>
            warn
          </Chip>
          <Chip tone="bad" solid>
            bad
          </Chip>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="subtitle" variant="tertiary" mono>
          sizes
        </Typography>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="ok" size="sm">
            sm
          </Chip>
          <Chip tone="ok" size="md">
            md
          </Chip>
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
