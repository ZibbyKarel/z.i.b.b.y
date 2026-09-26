import type { Meta, StoryObj } from "@storybook/react";
import { PipelineStepStrip } from "./PipelineStepStrip";
import type { PipelineStepStripPhase } from "./PipelineStepStrip";

const meta: Meta<typeof PipelineStepStrip> = {
  title: "DesignSystem/PipelineStepStrip",
  component: PipelineStepStrip,
  args: {},
};
export default meta;

type Story = StoryObj<typeof PipelineStepStrip>;

const PHASES: PipelineStepStripPhase[] = [
  { label: "Architekt", state: "done" },
  { label: "Kodér", state: "working" },
  { label: "Code-review", state: "idle", loopBack: true },
  { label: "Tester", state: "idle" },
  { label: "Dokumentátor", state: "idle" },
];

export const Overview: Story = {
  render: () => (
    <div className="flex max-w-2xl flex-col gap-6 p-8">
      <PipelineStepStrip current={1} phases={PHASES} />
      <PipelineStepStrip phases={PHASES.map((p) => ({ ...p, state: "done" as const }))} />
    </div>
  ),
};

export const Playground: Story = {
  args: { phases: PHASES, current: 1 },
};
