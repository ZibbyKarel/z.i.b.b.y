import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { FloatingPanel } from "./FloatingPanel";

const meta: Meta<typeof FloatingPanel> = {
  title: "DesignSystem/FloatingPanel",
  component: FloatingPanel,
  parameters: { backgrounds: { default: "velin" } },
};
export default meta;

type Story = StoryObj<typeof FloatingPanel>;

function Swatch({ index }: { index: number }) {
  return (
    <FloatingPanel index={index}>
      <div className="flex h-16 w-40 items-center justify-center rounded-lg border border-border bg-surface">
        <Typography type="note">index {index}</Typography>
      </div>
    </FloatingPanel>
  );
}

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-3 p-12">
      <Typography type="label">
        each panel drifts on its own duration/delay — watch a few seconds to see the wave break
      </Typography>
      <div className="flex items-start gap-6">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <Swatch index={index} key={index} />
        ))}
      </div>
    </div>
  ),
};
