import type { Meta, StoryObj } from "@storybook/react";
import { LogStream } from "./LogStream";
import type { LogStreamLine } from "./LogStream";

const LINES: LogStreamLine[] = [
  { id: "l1", ts: "14:01:52", source: "DEV", text: "Architekt drafted the plan." },
  { id: "l2", ts: "14:02:01", source: "DEV", text: "Kodér opened a branch." },
  { id: "l3", ts: "14:02:07", source: "DEV", state: "working", text: "Running the test suite…" },
];

const meta: Meta<typeof LogStream> = {
  title: "DesignSystem/LogStream",
  component: LogStream,
  args: {},
};
export default meta;

type Story = StoryObj<typeof LogStream>;

export const Overview: Story = {
  render: () => (
    <div className="flex max-w-2xl flex-col gap-6 p-8">
      <LogStream lines={LINES} />
      <LogStream empty="Nothing matches yet." lines={[]} />
    </div>
  ),
};

export const Playground: Story = {
  args: { lines: LINES },
};
