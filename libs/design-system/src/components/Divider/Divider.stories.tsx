import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { Divider } from "./Divider";

const meta: Meta<typeof Divider> = {
  title: "DesignSystem/Divider",
  component: Divider,
  parameters: { backgrounds: { default: "velin" } },
  args: { orientation: "horizontal" },
};
export default meta;

type Story = StoryObj<typeof Divider>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          horizontal
        </Typography>
        <div className="flex flex-col gap-4 p-4">
          <span className="font-mono text-sm text-foreground-dim">Sekce A</span>
          <Divider orientation="horizontal" />
          <span className="font-mono text-sm text-foreground-dim">Sekce B</span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          vertical
        </Typography>
        <div className="flex h-8 items-center gap-4 p-4">
          <span className="font-mono text-sm text-foreground-dim">Vlevo</span>
          <Divider orientation="vertical" />
          <span className="font-mono text-sm text-foreground-dim">Vpravo</span>
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
