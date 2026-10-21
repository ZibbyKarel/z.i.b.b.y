import type { Meta, StoryObj } from "@storybook/react";
import { StatCell, StatCellGrid } from "./StatCell";

const meta: Meta<typeof StatCell> = {
  title: "DesignSystem/StatCell",
  component: StatCell,
  args: { label: "CHECKS", value: "3 / 4", tone: "working" },
  argTypes: {
    tone: {
      control: "select",
      options: ["working", "thinking", "blocked", "error", "done", "idle", "neutral", "faint"],
    },
  },
};
export default meta;
type Story = StoryObj<typeof StatCell>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <StatCellGrid>
        <StatCell label="REVIEW" tone="blocked" value="CHANGES REQUESTED" />
        <StatCell label="CHECKS" tone="working" value="3 / 4" />
        <StatCell label="CHANGES" tone="faint" value="+120 −14" />
      </StatCellGrid>
      <StatCellGrid columns="fit">
        <StatCell
          filled
          label="01 · ENG"
          meta="BUILD · STEP 2"
          status="WORKING"
          title="Engineering"
          tone="working"
        />
        <StatCell label="02 · QA" meta="TEST · —" status="IDLE" title="Quality" tone="idle" />
      </StatCellGrid>
    </div>
  ),
};
export const Playground: Story = {};
