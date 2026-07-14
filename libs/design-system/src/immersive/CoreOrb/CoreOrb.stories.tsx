import type { Meta, StoryObj } from "@storybook/react";
import { CoreOrb } from "./CoreOrb";

const meta: Meta<typeof CoreOrb> = {
  title: "Immersive/CoreOrb",
  component: CoreOrb,
  parameters: { backgrounds: { default: "velin" } },
  args: {
    size: 200,
    hex: "#5b8def",
    intensity: 0.4,
    thinking: false,
    activeCount: 4,
  },
};
export default meta;

type Story = StoryObj<typeof CoreOrb>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-16">
      <div className="relative" style={{ width: 264, height: 264 }}>
        <CoreOrb size={264} thinking={false} />
      </div>
      <div className="relative" style={{ width: 264, height: 264 }}>
        <CoreOrb size={264} thinking={true} />
      </div>
      <div className="relative" style={{ width: 120, height: 120 }}>
        <CoreOrb size={120} thinking={false} />
      </div>
      <div className="relative" style={{ width: 120, height: 120 }}>
        <CoreOrb size={120} thinking={true} />
      </div>
    </div>
  ),
};

export const Playground: StoryObj<typeof CoreOrb> = {
  argTypes: {
    size: { control: { type: "range", min: 96, max: 264, step: 4 } },
    hex: { control: "color" },
    intensity: { control: { type: "range", min: 0, max: 0.7, step: 0.01 } },
    thinking: { control: "boolean" },
    activeCount: { control: { type: "range", min: 0, max: 6, step: 1 } },
  },
  render: (args) => (
    <div className="relative" style={{ width: args.size, height: args.size }}>
      <CoreOrb {...args} />
    </div>
  ),
};
