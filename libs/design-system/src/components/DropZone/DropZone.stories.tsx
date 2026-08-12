import type { Meta, StoryObj } from "@storybook/react";
import { DropZone } from "./DropZone";

const meta: Meta<typeof DropZone> = {
  title: "DesignSystem/DropZone",
  component: DropZone,
  parameters: { backgrounds: { default: "velin" } },
  args: {
    onDrop: (files) => console.log("dropped", files),
  },
};
export default meta;

type Story = StoryObj<typeof DropZone>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="font-mono text-sm text-foreground-dim">idle</span>
        <div className="w-[480px]">
          <DropZone onDrop={(files) => console.log("dropped", files)} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="font-mono text-sm text-foreground-dim">invalid</span>
        <div className="w-[480px]">
          <DropZone invalid onDrop={(files) => console.log("dropped", files)} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="font-mono text-sm text-foreground-dim">disabled</span>
        <div className="w-[480px]">
          <DropZone disabled onDrop={(files) => console.log("dropped", files)} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="font-mono text-sm text-foreground-dim">images only (accept filter)</span>
        <div className="w-[480px]">
          <DropZone
            accept={{ "image/*": [".png", ".jpg", ".jpeg", ".webp"] }}
            idleLabel="Drop images here or click to select"
            onDrop={(files) => console.log("dropped", files)}
          />
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
