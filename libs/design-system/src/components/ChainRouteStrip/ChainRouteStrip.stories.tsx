import type { Meta, StoryObj } from "@storybook/react";
import { ChainRouteStrip } from "./ChainRouteStrip";
import type { ChainRouteStripGate, ChainRouteStripStep } from "./ChainRouteStrip";

const meta: Meta<typeof ChainRouteStrip> = {
  title: "DesignSystem/ChainRouteStrip",
  component: ChainRouteStrip,
  args: {},
};
export default meta;

type Story = StoryObj<typeof ChainRouteStrip>;

const STEPS: ChainRouteStripStep[] = [
  { code: "DEV", name: "Add SSO to the client portal", state: "done", pipeline: "Delivery" },
  { code: "QA", name: "Verify the SSO flow", state: "working", pipeline: "Test", selected: true },
  { code: "REL", name: "Ship the release", state: "idle" },
];

const GATES: ChainRouteStripGate[] = [{ mode: "auto" }, { mode: "ask" }];

export const Overview: Story = {
  render: () => (
    <div className="flex max-w-3xl flex-col gap-8 p-8">
      <ChainRouteStrip gates={GATES} size="full" steps={STEPS} />
      <ChainRouteStrip gates={GATES} size="compact" steps={STEPS} />
      <ChainRouteStrip size="chip" steps={STEPS} />
    </div>
  ),
};

export const Playground: Story = {
  args: { steps: STEPS, gates: GATES, size: "full" },
};
