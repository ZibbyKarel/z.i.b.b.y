import type { Meta, StoryObj } from "@storybook/react";
import { WorkflowStepStrip } from "./WorkflowStepStrip";
import type { WorkflowStepStripPhase } from "./WorkflowStepStrip";

const meta: Meta<typeof WorkflowStepStrip> = {
  title: "DesignSystem/WorkflowStepStrip",
  component: WorkflowStepStrip,
  args: {},
};
export default meta;

type Story = StoryObj<typeof WorkflowStepStrip>;

const PHASES: WorkflowStepStripPhase[] = [
  { label: "Architekt", state: "done" },
  { label: "Kodér", state: "working" },
  { label: "Code-review", state: "idle", loopBack: true },
  { label: "Tester", state: "idle" },
  { label: "Dokumentátor", state: "idle" },
];

export const Overview: Story = {
  render: () => (
    <div className="flex max-w-2xl flex-col gap-6 p-8">
      <WorkflowStepStrip current={1} phases={PHASES} />
      <WorkflowStepStrip phases={PHASES.map((p) => ({ ...p, state: "done" as const }))} />
    </div>
  ),
};

export const Playground: Story = {
  args: { phases: PHASES, current: 1 },
};
