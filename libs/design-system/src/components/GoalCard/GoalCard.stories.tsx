import type { Meta, StoryObj } from "@storybook/react";
import { GoalCard } from "./GoalCard";

const meta: Meta<typeof GoalCard> = {
  title: "DesignSystem/GoalCard",
  component: GoalCard,
  parameters: { backgrounds: { default: "velin" } },
  args: {
    eyebrow: "ship-feature · CLIENT-PORTAL",
    title: "Ship feature Y green",
    makerLabel: "delivery",
    verifierLabel: "checks",
    used: 3,
    max: 10,
    state: "working",
  },
};
export default meta;

type Story = StoryObj<typeof GoalCard>;

export const Overview: Story = {
  render: () => (
    <div className="grid w-[820px] grid-cols-2 gap-3">
      <GoalCard
        eyebrow="ship-feature · CLIENT-PORTAL"
        iterationSummary="Iteration 3 · verifier failed: 2 checks red."
        makerLabel="delivery"
        max={10}
        onStop={() => {}}
        state="working"
        title="Ship feature Y green"
        used={3}
        verifierLabel="checks"
      />
      <GoalCard
        eyebrow="fix-flaky-e2e · —"
        iterationSummary="Parked — run budget exhausted."
        makerLabel="qa-agent"
        max={5}
        onResume={() => {}}
        state="blocked"
        stateLabel="Parked"
        title="Make e2e suite deterministic"
        used={5}
        verifierLabel="claude"
      />
      <GoalCard
        eyebrow="refactor-auth · AUTH-SVC"
        makerLabel="rnd-pipeline"
        max={8}
        onOpen={() => {}}
        state="done"
        title="Migrate auth to the new session store"
        used={4}
        verifierLabel="checks"
      />
    </div>
  ),
};

export const Playground: Story = {};
