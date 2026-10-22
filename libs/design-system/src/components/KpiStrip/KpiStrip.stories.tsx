import type { Meta, StoryObj } from "@storybook/react";
import { BoardText } from "../BoardText/BoardText";
import { KpiStrip } from "./KpiStrip";

const kpis = [
  { id: "needs", label: "NEEDS YOU", value: "03", tone: "blocked" as const },
  { id: "running", label: "RUNNING NOW", value: "02", tone: "working" as const },
  { id: "prs", label: "OPEN PRS", value: "07", tone: "thinking" as const },
  { id: "spend", label: "SPEND TODAY", value: "$18.90", tone: "idle" as const },
];

const meta: Meta<typeof KpiStrip> = {
  title: "DesignSystem/KpiStrip",
  component: KpiStrip,
  parameters: { backgrounds: { default: "velin" } },
  args: { kpis },
  decorators: [(Story) => <div className="w-[900px] bg-panel">{Story()}</div>],
};
export default meta;

type Story = StoryObj<typeof KpiStrip>;

export const Overview: Story = {
  render: () => (
    <KpiStrip
      kpis={kpis}
      lead={
        <>
          <BoardText kind="kicker">THU 24 SEP</BoardText>
          <BoardText kind="lead">Two PRs wait on you; nothing is on fire.</BoardText>
        </>
      }
    />
  ),
};
export const Narrow: Story = {
  decorators: [(Story) => <div className="w-[320px]">{Story()}</div>],
  render: Overview.render,
};
export const Playground: Story = {};
