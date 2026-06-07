import type { Meta, StoryObj } from "@storybook/react";
import { DropZone } from "./DropZone";

const meta = {
  title: "Design System/DropZone",
  component: DropZone,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 480 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DropZone>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onDrop: (files) => console.log("dropped", files),
  },
};

export const Invalid: Story = {
  args: {
    onDrop: (files) => console.log("dropped", files),
    invalid: true,
  },
};

export const Disabled: Story = {
  args: {
    onDrop: (files) => console.log("dropped", files),
    disabled: true,
  },
};

export const ImagesOnly: Story = {
  args: {
    onDrop: (files) => console.log("dropped", files),
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp"] },
  },
};
