import type { Meta, StoryObj } from "@storybook/react";
import { RailSplit } from "./RailSplit";

const meta: Meta<typeof RailSplit> = {
  title: "DesignSystem/RailSplit",
  component: RailSplit,
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof RailSplit>;

const rail = (
  <div className="flex flex-col">
    {["Plan", "Build", "Review", "Test", "Docs"].map((s, i) => (
      <div className="border-b border-border px-4 py-3 text-sm text-foreground" key={s}>
        {i + 1} · {s}
      </div>
    ))}
  </div>
);
const lines = Array.from({ length: 30 }, (_, i) => (
  <p className="text-sm text-foreground-dim" key={i}>
    Feed line {i + 1}
  </p>
));

export const Overview: Story = {
  render: () => (
    <RailSplit
      footer={<span className="text-sm text-foreground-dim">Composer</span>}
      rail={rail}
      toolbar={<span className="text-sm text-foreground-dim">Toolbar</span>}
    >
      {lines}
    </RailSplit>
  ),
};

export const Playground: Story = {
  args: { rail, children: lines },
};
