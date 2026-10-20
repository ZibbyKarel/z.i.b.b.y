import type { Meta, StoryObj } from "@storybook/react";
import { RailItem } from "./RailItem";

const meta: Meta<typeof RailItem> = {
  title: "DesignSystem/RailItem",
  component: RailItem,
  args: { title: "2 · Build", meta: "RUNNING · 01:12", leading: "●", selected: false },
};
export default meta;

type Story = StoryObj<typeof RailItem>;

const STAGES = ["Plan", "Build", "Review", "Test", "Docs"];

export const Overview: Story = {
  render: () => (
    <div className="flex w-[260px] flex-col border border-border">
      {STAGES.map((s, i) => (
        <RailItem
          key={s}
          leading="●"
          meta={i === 0 ? "DONE · 00:42" : i === 1 ? "RUNNING · 01:12" : "PENDING"}
          selected={i === 1}
          title={`${i + 1} · ${s}`}
        />
      ))}
    </div>
  ),
};

export const Playground: Story = {};
