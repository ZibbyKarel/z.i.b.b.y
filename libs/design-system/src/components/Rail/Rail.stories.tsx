import type { Meta, StoryObj } from "@storybook/react";
import { Rail } from "./Rail";
import { AgentGlyph } from "../AgentGlyph/AgentGlyph";
import { Typography } from "../Typography/Typography";

function ApprovalRow({ name }: { name: string }) {
  return (
    <div className="flex flex-col gap-2.5 border border-line-2 bg-background p-3">
      <div className="flex items-center gap-2.5">
        <AgentGlyph seed={name} size={30} state="blocked" />
        <Typography type="body" weight="medium">
          {name}
        </Typography>
      </div>
      <Typography type="bodySm" variant="secondary">
        Wants to push the release branch to main.
      </Typography>
    </div>
  );
}

const meta: Meta<typeof Rail> = {
  title: "DesignSystem/Rail",
  component: Rail,
  parameters: { backgrounds: { default: "velin" } },
};
export default meta;

type Story = StoryObj<typeof Rail>;

export const Overview: Story = {
  render: () => (
    <div className="flex gap-8">
      <div className="h-[420px] w-[280px] border border-line">
        <Rail count={2}>
          <ApprovalRow name="Kevin" />
          <ApprovalRow name="Stuart" />
        </Rail>
      </div>
      <div className="h-[420px] w-[280px] border border-line">
        <Rail empty="Nothing is waiting for you. Agents continue on their own until a gate fires." />
      </div>
    </div>
  ),
};

export const Playground: Story = {
  args: { count: 2 },
  render: (args) => (
    <div className="h-[420px] w-[280px] border border-line">
      <Rail {...args}>
        <ApprovalRow name="Bob" />
        <ApprovalRow name="Kevin" />
      </Rail>
    </div>
  ),
};
