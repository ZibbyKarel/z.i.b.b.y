import type { Meta, StoryObj } from "@storybook/react";
import { OrbitField } from "./OrbitField";

const meta: Meta<typeof OrbitField> = {
  title: "Immersive/OrbitField",
  component: OrbitField,
  parameters: { backgrounds: { default: "velin" } },
  args: {
    seed: "zibby-core",
    color: "#7aa5f8",
    count: 4,
    baseRadius: 40,
  },
};
export default meta;

type Story = StoryObj<typeof OrbitField>;

const FIELDS: { seed: string; color: string; count: number; baseRadius: number }[] = [
  { seed: "zibby-core", color: "#7aa5f8", count: 2, baseRadius: 30 },
  { seed: "scout", color: "#3fcf8e", count: 4, baseRadius: 40 },
  { seed: "forge", color: "#f0b429", count: 6, baseRadius: 50 },
];

export const Overview: Story = {
  render: () => (
    <div className="flex flex-wrap gap-16">
      {FIELDS.map((f) => (
        <div className="relative h-32 w-32" key={f.seed}>
          <OrbitField baseRadius={f.baseRadius} color={f.color} count={f.count} seed={f.seed} />
        </div>
      ))}
    </div>
  ),
};

export const Playground: Story = {
  argTypes: {
    count: { control: { type: "range", min: 0, max: 6, step: 1 } },
    color: { control: "color" },
    baseRadius: { control: { type: "range", min: 10, max: 120, step: 2 } },
    seed: { control: "text" },
  },
  render: (args) => (
    <div className="relative h-64 w-64">
      <OrbitField {...args} />
    </div>
  ),
};
