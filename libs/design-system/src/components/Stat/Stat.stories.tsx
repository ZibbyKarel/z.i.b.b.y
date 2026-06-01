import type { Meta, StoryObj } from "@storybook/react";
import { Stat } from "./Stat";

const meta: Meta<typeof Stat> = {
  title: "Components/Stat",
  component: Stat,
  parameters: { backgrounds: { default: "velin" } },
  args: { value: "02", label: "běžící agenti", icon: "pulse", tone: "accent" },
};
export default meta;

type Story = StoryObj<typeof Stat>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-wrap gap-9">
      <Stat icon="pulse" label="běžící agenti" tone="accent" value="02" />
      <Stat icon="shield" label="schválení" tone="bad" value="01" />
      <Stat icon="dollar" label="agent sdk kredit" tone="warn" value="$128" />
      <Stat icon="flow" label="pipeline" tone="neutral" value="04" />
    </div>
  ),
};

export const Playground: Story = {};
