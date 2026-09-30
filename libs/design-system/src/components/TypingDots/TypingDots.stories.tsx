import type { Meta, StoryObj } from "@storybook/react";
import { TypingDots } from "./TypingDots";

const meta: Meta<typeof TypingDots> = {
  title: "DesignSystem/TypingDots",
  component: TypingDots,
  parameters: { backgrounds: { default: "velin" } },
  args: { label: "ZIBBY píše…" },
};
export default meta;

type Story = StoryObj<typeof TypingDots>;

export const Playground: Story = {};
