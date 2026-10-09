import type { Meta, StoryObj } from "@storybook/react";
import { VoiceBars } from "./VoiceBars";

const meta: Meta<typeof VoiceBars> = {
  title: "DesignSystem/VoiceBars",
  component: VoiceBars,
};
export default meta;

type Story = StoryObj<typeof VoiceBars>;

export const Overview: Story = { render: () => <VoiceBars /> };
